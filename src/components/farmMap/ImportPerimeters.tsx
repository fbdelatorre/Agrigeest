import React, { useState, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { ImportedPolygon } from '../../types/farmMap';
import {
  parseKML,
  parseGeoJSONFile,
  parseShapefile,
  parseKMZ,
  matchPolygonToAreas,
} from '../../utils/farmMap/farmMapHelpers';
import { Upload, X, FileText, Check, AlertCircle, MapPin, Link2, Unlink } from 'lucide-react';

interface ImportPerimetersProps {
  onClose: () => void;
  onImportComplete: () => void;
}

const ImportPerimeters: React.FC<ImportPerimetersProps> = ({ onClose, onImportComplete }) => {
  const { areas, saveAreaGeometry } = useAppContext();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [polygons, setPolygons] = useState<ImportedPolygon[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const areaList = areas.map(a => ({ id: a.id, name: a.name, size: a.size }));

  const handleFiles = async (files: FileList) => {
    setError(null);
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
        setError(language === 'pt'
          ? 'Formato nao suportado. Use KML, KMZ, GeoJSON ou Shapefile.'
          : 'Unsupported format. Use KML, KMZ, GeoJSON or Shapefile.');
        return;
      }

      if (imported.length === 0) {
        setError(language === 'pt'
          ? 'Nenhum poligono valido encontrado no arquivo.'
          : 'No valid polygons found in the file.');
        return;
      }

      const matched = imported.map(p => {
        const match = matchPolygonToAreas(p, areaList);
        return {
          ...p,
          matchedAreaId: match?.areaId || null,
          matchConfidence: match?.confidence || 0,
        };
      });

      setPolygons(matched);
    } catch (err) {
      console.error('Import error:', err);
      setError(language === 'pt'
        ? 'Erro ao processar o arquivo. Verifique o formato e tente novamente.'
        : 'Error processing the file. Check the format and try again.');
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

  const handleMatchChange = (polygonId: string, areaId: string) => {
    setPolygons(prev => prev.map(p =>
      p.id === polygonId ? { ...p, matchedAreaId: areaId || null } : p
    ));
  };

  const handleSave = async () => {
    setImporting(true);
    setError(null);

    try {
      const toSave = polygons.filter(p => p.matchedAreaId);
      for (const polygon of toSave) {
        await saveAreaGeometry(polygon.matchedAreaId!, JSON.stringify(polygon.geojson));
      }
      onImportComplete();
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      setError(language === 'pt'
        ? 'Erro ao salvar geometrias. Tente novamente.'
        : 'Error saving geometries. Try again.');
    } finally {
      setImporting(false);
    }
  };

  const matchedCount = polygons.filter(p => p.matchedAreaId).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <Upload size={24} className="mr-2 text-green-700" />
            {language === 'pt' ? 'Importar Perimetros' : 'Import Perimeters'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {polygons.length === 0 ? (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragOver ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <FileText size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  {language === 'pt' ? 'Arraste um arquivo aqui ou clique para selecionar' : 'Drag a file here or click to select'}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {language === 'pt'
                    ? 'Formatos suportados: KML, KMZ, GeoJSON, Shapefile (.shp ou .zip)'
                    : 'Supported formats: KML, KMZ, GeoJSON, Shapefile (.shp or .zip)'}
                </p>
                <Button onClick={() => fileInputRef.current?.click()} leftIcon={<Upload size={18} />}>
                  {language === 'pt' ? 'Selecionar Arquivo' : 'Select File'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".kml,.kmz,.geojson,.json,.shp,.zip"
                  onChange={handleFileInput}
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  {language === 'pt'
                    ? `${polygons.length} poligonos encontrados. ${matchedCount} ja associados. Confirme as associacoes antes de salvar.`
                    : `${polygons.length} polygons found. ${matchedCount} already matched. Confirm associations before saving.`}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-3">
                {polygons.map((polygon) => {
                  const matchedArea = areas.find(a => a.id === polygon.matchedAreaId);
                  const confidence = polygon.matchConfidence;
                  return (
                    <div key={polygon.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-2">
                          <MapPin size={20} className="text-green-700 mt-0.5" />
                          <div>
                            <div className="font-medium text-gray-900">{polygon.name}</div>
                            <div className="text-sm text-gray-500">
                              {polygon.areaHectares.toFixed(1)} ha
                            </div>
                          </div>
                        </div>
                        {confidence > 0.8 && (
                          <Badge variant="success" className="flex items-center gap-1">
                            <Check size={12} />
                            {language === 'pt' ? 'Sugerido' : 'Suggested'}
                          </Badge>
                        )}
                        {polygon.matchedAreaId && confidence <= 0.8 && confidence > 0.5 && (
                          <Badge variant="warning">
                            {language === 'pt' ? 'Possivel' : 'Possible'}
                          </Badge>
                        )}
                        {!polygon.matchedAreaId && (
                          <Badge variant="default" className="flex items-center gap-1">
                            <Unlink size={12} />
                            {language === 'pt' ? 'Nao associado' : 'Unlinked'}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link2 size={16} className="text-gray-400" />
                        <select
                          value={polygon.matchedAreaId || ''}
                          onChange={(e) => handleMatchChange(polygon.id, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">
                            {language === 'pt' ? 'Selecione uma area...' : 'Select an area...'}
                          </option>
                          {areas.map(area => (
                            <option key={area.id} value={area.id}>
                              {area.name} - {area.size} {area.unit}
                            </option>
                          ))}
                        </select>
                      </div>

                      {matchedArea && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                          <Check size={12} className="text-green-600" />
                          {language === 'pt' ? 'Sera vinculado a' : 'Will be linked to'}: {matchedArea.name}
                          {matchedArea.size && ` (${matchedArea.size} ${matchedArea.unit})`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {polygons.length > 0 && (
          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {matchedCount} / {polygons.length} {language === 'pt' ? 'associados' : 'matched'}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                {language === 'pt' ? 'Cancelar' : 'Cancel'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={matchedCount === 0 || importing}
                leftIcon={<Check size={18} />}
              >
                {importing
                  ? (language === 'pt' ? 'Salvando...' : 'Saving...')
                  : (language === 'pt' ? `Salvar ${matchedCount} Perimetros` : `Save ${matchedCount} Perimeters`)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportPerimeters;
