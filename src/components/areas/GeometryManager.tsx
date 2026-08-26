import React, { useState, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  MapPin, Upload, Trash2, Eye, X, Check, AlertCircle, FileText, RefreshCw,
} from 'lucide-react';
import {
  parseKML, parseGeoJSONFile, parseShapefile, parseKMZ,
} from '../../utils/farmMap/farmMapHelpers';
import { ImportedPolygon } from '../../types/farmMap';

interface GeometryManagerProps {
  areaId: string;
  areaName: string;
  currentGeometry?: string | object;
  onGeometryChanged?: () => void;
}

const GeometryManager: React.FC<GeometryManagerProps> = ({
  areaId,
  areaName,
  currentGeometry,
  onGeometryChanged,
}) => {
  const { saveAreaGeometry, deleteAreaGeometry } = useAppContext();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [importedPolygons, setImportedPolygons] = useState<ImportedPolygon[]>([]);
  const [selectedPolygonIdx, setSelectedPolygonIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const t = (pt: string, en: string) => language === 'pt' ? pt : en;

  const geometryString = currentGeometry
    ? (typeof currentGeometry === 'string' ? currentGeometry : JSON.stringify(currentGeometry))
    : undefined;
  const hasGeometry = !!geometryString;

  const handleFiles = async (files: FileList) => {
    setError(null);
    setSuccess(null);
    const file = files[0];
    if (!file) return;

    try {
      const ext = file.name.toLowerCase().split('.').pop();
      let imported: ImportedPolygon[] = [];

      if (ext === 'kml') {
        const text = await file.text();
        imported = parseKML(text);
      } else if (ext === 'geojson' || ext === 'json') {
        const text = await file.text();
        imported = parseGeoJSONFile(text);
      } else if (ext === 'kmz') {
        imported = await parseKMZ(file);
      } else if (ext === 'shp' || ext === 'zip') {
        imported = await parseShapefile(file);
      } else {
        setError(t('Formato não suportado. Use KML, KMZ, GeoJSON ou Shapefile.',
          'Unsupported format. Use KML, KMZ, GeoJSON or Shapefile.'));
        return;
      }

      if (imported.length === 0) {
        setError(t('Nenhum polígono válido encontrado no arquivo.',
          'No valid polygons found in the file.'));
        return;
      }

      setImportedPolygons(imported);
      setSelectedPolygonIdx(0);
    } catch (err) {
      console.error('Import error:', err);
      setError(t('Erro ao processar o arquivo. Verifique o formato e tente novamente.',
        'Error processing the file. Check the format and try again.'));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleConfirmReplace = async () => {
    if (importedPolygons.length === 0) return;
    const polygon = importedPolygons[selectedPolygonIdx];
    if (!polygon) return;

    setBusy(true);
    setError(null);
    try {
      await saveAreaGeometry(areaId, JSON.stringify(polygon.geojson));
      setSuccess(t('Geometria atualizada com sucesso!', 'Geometry updated successfully!'));
      setImportedPolygons([]);
      setShowPreview(false);
      onGeometryChanged?.();
    } catch (err) {
      console.error('Save error:', err);
      setError(t('Erro ao salvar geometria. Tente novamente.',
        'Error saving geometry. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(
      t('Tem certeza que deseja excluir a geometria desta área? A área continuará existindo, mas não aparecerá no mapa.',
        'Are you sure you want to delete this area\'s geometry? The area will still exist, but will no longer appear on the map.')
    )) return;

    setBusy(true);
    setError(null);
    try {
      await deleteAreaGeometry(areaId);
      setSuccess(t('Geometria excluída com sucesso!', 'Geometry deleted successfully!'));
      onGeometryChanged?.();
    } catch (err) {
      console.error('Delete error:', err);
      setError(t('Erro ao excluir geometria. Tente novamente.',
        'Error deleting geometry. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelImport = () => {
    setImportedPolygons([]);
    setShowPreview(false);
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-green-700" />
          <h3 className="text-sm font-semibold text-gray-900">
            {t('Geometria do Perímetro', 'Perimeter Geometry')}
          </h3>
        </div>
        {hasGeometry ? (
          <Badge variant="success" className="flex items-center gap-1">
            <Check size={12} />
            {t('Definida', 'Set')}
          </Badge>
        ) : (
          <Badge variant="default" className="flex items-center gap-1">
            <X size={12} />
            {t('Não definida', 'Not set')}
          </Badge>
        )}
      </div>

      <p className="text-sm text-gray-600">
        {t(
          'A geometria define o perímetro da área no mapa. Você pode visualizar, substituir ou excluir a geometria atual.',
          'The geometry defines the area perimeter on the map. You can view, replace, or delete the current geometry.'
        )}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-green-700">
          <Check size={18} />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {showPreview && importedPolygons.length > 0 ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              {importedPolygons.length > 1
                ? t(
                    `${importedPolygons.length} polígonos encontrados. Selecione qual vincular a "${areaName}".`,
                    `${importedPolygons.length} polygons found. Select which one to link to "${areaName}".`
                  )
                : t('1 polígono encontrado. Confirme para vincular a esta área.',
                  '1 polygon found. Confirm to link to this area.')
              }
            </p>
          </div>

          {importedPolygons.length > 1 && (
            <select
              value={selectedPolygonIdx}
              onChange={(e) => setSelectedPolygonIdx(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {importedPolygons.map((p, idx) => (
                <option key={p.id} value={idx}>
                  {p.name || `Polígono ${idx + 1}`} - {p.areaHectares.toFixed(1)} ha
                </option>
              ))}
            </select>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-900">
                {importedPolygons[selectedPolygonIdx]?.name || t('Polígono selecionado', 'Selected polygon')}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {importedPolygons[selectedPolygonIdx]?.areaHectares.toFixed(1)} ha
              {' · '}
              {importedPolygons[selectedPolygonIdx]?.geojson.type}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleConfirmReplace}
              disabled={busy}
              leftIcon={<Check size={18} />}
            >
              {busy ? t('Salvando...', 'Saving...') : t('Confirmar Substituição', 'Confirm Replace')}
            </Button>
            <Button variant="outline" onClick={handleCancelImport} leftIcon={<X size={18} />}>
              {t('Cancelar', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {hasGeometry && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-900">
                  {t('Geometria atual', 'Current geometry')}
                </span>
              </div>
              <pre className="text-xs text-gray-600 bg-white border border-gray-100 rounded p-2 max-h-32 overflow-auto">
                {geometryString!.substring(0, 500)}
                {geometryString!.length > 500 ? '...' : ''}
              </pre>
            </div>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              {hasGeometry
                ? t('Arraste um arquivo para substituir a geometria atual', 'Drag a file to replace the current geometry')
                : t('Arraste um arquivo para definir a geometria', 'Drag a file to define the geometry')
            }
            </p>
            <p className="text-xs text-gray-400 mb-3">
              {t('KML, KMZ, GeoJSON, Shapefile', 'KML, KMZ, GeoJSON, Shapefile')}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload size={16} />}
            >
              {t('Selecionar Arquivo', 'Select File')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".kml,.kmz,.geojson,.json,.shp,.zip"
              onChange={handleFileInput}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {hasGeometry && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                leftIcon={<Trash2 size={16} />}
              >
                {t('Excluir Geometria', 'Delete Geometry')}
              </Button>
            )}
            <a href={`/farm-map`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" leftIcon={<MapPin size={16} />}>
                {t('Ver no Mapa', 'View on Map')}
              </Button>
            </a>
          </div>
        </>
      )}
    </div>
  );
};

export default GeometryManager;
