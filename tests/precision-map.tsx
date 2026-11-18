import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PrecisionMap, { type IndexImage, type MapField } from '../src/components/farmMap/PrecisionMap';

const corners: IndexImage['corners'] = [[-50, -19.99], [-49.99, -19.99], [-49.99, -20], [-50, -20]];
const fields: MapField[] = [{ type: 'Feature', properties: { id: 'test', name: 'Teste' },
  geometry: { type: 'Polygon', coordinates: [[...corners, corners[0]]] } }];
function picture(color: string): IndexImage {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 16, 16);
  return { url: canvas.toDataURL('image/png'), corners };
}
function Fixture() {
  const [imagery, setImagery] = useState<IndexImage | undefined>(picture('#ff0000'));
  return <>
    <style>{'[aria-label="Mapa dos talhões"] {height:400px;width:700px}'}</style>
    <button onClick={() => setImagery(picture('#0000ff'))}>Trocar imagem</button>
    <button onClick={() => setImagery(undefined)}>Ocultar imagem</button>
    <button onClick={() => setImagery({ url: 'data:image/png;base64,INVALID', corners })}>Imagem inválida</button>
    <PrecisionMap fields={fields} points={[]} focus="test" imagery={imagery} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
