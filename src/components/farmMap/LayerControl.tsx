import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { LayerSettings, BaseMapStyle } from '../../types/farmMap';
import { Layers, Satellite, Route, Eye, EyeOff } from 'lucide-react';

interface LayerControlProps {
  settings: LayerSettings;
  onChange: (settings: LayerSettings) => void;
}

const LayerControl: React.FC<LayerControlProps> = ({ settings, onChange }) => {
  const { language } = useLanguage();

  const toggle = (key: keyof LayerSettings) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
        <Layers size={18} className="mr-2 text-green-700" />
        <h3 className="font-medium text-gray-900 text-sm">
          {language === 'pt' ? 'Camadas' : 'Layers'}
        </h3>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            {language === 'pt' ? 'Mapa Base' : 'Base Map'}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onChange({ ...settings, baseMap: 'satellite' as BaseMapStyle })}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors ${settings.baseMap === 'satellite' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <Satellite size={16} />
              {language === 'pt' ? 'Satelite' : 'Satellite'}
            </button>
            <button
              onClick={() => onChange({ ...settings, baseMap: 'streets' as BaseMapStyle })}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors ${settings.baseMap === 'streets' ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <Route size={16} />
              {language === 'pt' ? 'Ruas' : 'Streets'}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-500 uppercase">
              {language === 'pt' ? 'Limite' : 'Boundary'}
            </h4>
            <span className="text-xs font-medium text-gray-600">
              {Math.round(settings.boundaryOpacity * 100)}%
            </span>
          </div>
          <label className="block">
            <span className="sr-only">{language === 'pt' ? 'Opacidade do limite' : 'Boundary opacity'}</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.boundaryOpacity}
              onChange={(event) => onChange({ ...settings, boundaryOpacity: Number(event.target.value) })}
              className="w-full accent-green-700"
            />
          </label>
        </div>

        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            {language === 'pt' ? 'Informacoes' : 'Information'}
          </h4>
          <div className="space-y-1">
            <LayerToggle
              label={language === 'pt' ? 'Limites das areas' : 'Area boundaries'}
              visible={settings.showBoundaries}
              onToggle={() => toggle('showBoundaries')}
            />
            <LayerToggle
              label={language === 'pt' ? 'Nomes das areas' : 'Area names'}
              visible={settings.showNames}
              onToggle={() => toggle('showNames')}
            />
            <LayerToggle
              label={language === 'pt' ? 'Cultura' : 'Crop'}
              visible={settings.showCrop}
              onToggle={() => toggle('showCrop')}
            />
            <LayerToggle
              label={language === 'pt' ? 'Cultivar' : 'Cultivar'}
              visible={settings.showCultivar}
              onToggle={() => toggle('showCultivar')}
            />
            <LayerToggle
              label={language === 'pt' ? 'Ultimas aplicacoes' : 'Last applications'}
              visible={settings.showLastApplication}
              onToggle={() => toggle('showLastApplication')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface LayerToggleProps {
  label: string;
  visible: boolean;
  onToggle: () => void;
}

const LayerToggle: React.FC<LayerToggleProps> = ({ label, visible, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-2 py-1.5 rounded text-sm hover:bg-gray-50 transition-colors"
    >
      <span className="text-gray-700">{label}</span>
      {visible ? <Eye size={16} className="text-green-600" /> : <EyeOff size={16} className="text-gray-400" />}
    </button>
  );
};

export default LayerControl;
