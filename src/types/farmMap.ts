export type ViewMode =
  | 'lastOperation'
  | 'lastFungicide'
  | 'lastInsecticide'
  | 'lastHerbicide'
  | 'lastDessecacao'
  | 'nextApplication'
  | 'crop'
  | 'cultivar';

export interface AreaMapSummary {
  areaId: string;
  areaName: string;
  areaSize: number;
  areaUnit: string;
  currentCrop: string | null;
  cultivar: string | null;
  geojson: string | null;
  lastOperationDate: string | null;
  lastFungicideDate: string | null;
  lastInsecticideDate: string | null;
  lastHerbicideDate: string | null;
  lastDessecacaoDate: string | null;
  nextOperationDate: string | null;
}

export interface ImportedPolygon {
  id: string;
  name: string;
  areaHectares: number;
  geojson: GeoJSON.Feature;
  matchedAreaId: string | null;
  matchConfidence: number;
}

export type BaseMapStyle = 'satellite' | 'streets';

export interface LayerSettings {
  baseMap: BaseMapStyle;
  showBoundaries: boolean;
  boundaryOpacity: number;
  showNames: boolean;
  showCrop: boolean;
  showCultivar: boolean;
  showLastApplication: boolean;
}

export interface ColorScaleEntry {
  label: string;
  color: string;
  maxDays: number | null;
}

export interface MapFilters {
  crop: string;
  cultivar: string;
  operationType: string;
  operator: string;
  product: string;
  nextAppStatus: string;
}
