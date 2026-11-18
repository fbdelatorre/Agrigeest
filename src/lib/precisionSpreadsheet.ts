export type LabRow = {
  reported_code: string; parameter: string; original_value: string; value: number | null;
  unit: string; method: string; material: string; source: string;
  original_parameter?: string;
};
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const names = new Map(Object.entries({
  ph: 'pH', p: 'Fósforo', phosphorus: 'Fósforo', fosforo: 'Fósforo', k: 'Potássio', potassium: 'Potássio',
  potassio: 'Potássio', ca: 'Cálcio', calcium: 'Cálcio', calcio: 'Cálcio', mg: 'Magnésio', magnesium: 'Magnésio', magnesio: 'Magnésio',
  mo: 'Matéria orgânica', 'organic matter': 'Matéria orgânica',
  n: 'Nitrogênio', nitrogen: 'Nitrogênio', nitrogenio: 'Nitrogênio',
  aluminio: 'Alumínio', 'h+al': 'H+Al', 'materia organica': 'Matéria orgânica', carbono: 'Carbono',
  s: 'Enxofre', enxofre: 'Enxofre', b: 'Boro', boro: 'Boro', zn: 'Zinco', zinco: 'Zinco',
  cu: 'Cobre', cobre: 'Cobre', fe: 'Ferro', ferro: 'Ferro', mn: 'Manganês', manganes: 'Manganês',
  pratylenchus: 'Pratylenchus', meloidogyne: 'Meloidogyne', heterodera: 'Heterodera', rotylenchulus: 'Rotylenchulus',
  ctc: 'CTC', 'saturacao por bases': 'Saturação por bases', 'saturacao por aluminio': 'Saturação por alumínio',
}));
export { standardParameters as standardLabParameters } from '../../supabase/functions/precision-lab-assist/labels.ts';

export function knownLabUnit(unit: string) {
  const comparable = unit.toLowerCase().normalize('NFKC').replace(/\s/g, '');
  return /^(?:%|ppm|ppb|(?:mmolc?|cmolc?|mol|mg|g|kg|µg|μg|ug|meq)\/(?:dm3|cm3|kg|g|l|ml|100g|ha)|(?:ovos|juvenis|adultos|nematoides|individuos)\/(?:g|100g|cm3|100cm3|200cm3))$/.test(comparable);
}

export function labNumber(input: string) {
  let text = input.trim().replace(/[\u00a0 ]/g, '');
  if (!/^[+-]?\d+(?:[.,]\d+)*(?:e[+-]?\d+)?$/i.test(text)) return null;
  if (text.includes(',') && text.includes('.')) {
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const grouped = decimal === ',' ? /^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/ : /^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/;
    if (!grouped.test(text)) return null;
    text = decimal === ',' ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else {
    if ((text.match(/[.,]/g) ?? []).length > 1) return null;
    text = text.replace(',', '.');
  }
  const value = Number(text);
  return Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : null;
}

function readCsv(text: string) {
  const first = text.split(/\r?\n/).find(line => /amostra|sampl|codigo|código/i.test(line)) ?? text.split(/\r?\n/)[0];
  const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!field || quoted) quoted = !quoted;
      else field += char;
    } else if (!quoted && (char === delimiter || char === '\n')) {
      row.push(field.trim()); field = '';
      if (row.length > 300) throw new Error('O CSV ultrapassa 300 colunas.');
      if (char === '\n') {
        rows.push(row); row = [];
        if (rows.length > 10000) throw new Error('O CSV ultrapassa 10.000 linhas.');
      }
    } else field += char;
  }
  if (quoted) throw new Error('Aspas incompletas no CSV.');
  if (row.length || field) {
    if (row.length >= 300 || rows.length >= 10000) throw new Error('O CSV ultrapassa o limite de linhas ou colunas.');
    rows.push([...row, field.trim()]);
  }
  return rows;
}

const xml = (text: string) => {
  const parsed = new DOMParser().parseFromString(text, 'text/xml');
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('Planilha XLSX inválida.');
  return parsed;
};

async function readXlsx(data: ArrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const paths = Object.values(zip.files).filter(file => !file.dir);
  const total = paths.reduce((sum, file) => sum + ((file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? Infinity), 0);
  if (paths.length > 250 || total > 24000000) throw new Error('A planilha expandida ultrapassa o limite de leitura.');
  const workbook = zip.file('xl/workbook.xml');
  const links = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbook || !links) throw new Error('Arquivo XLSX incompleto.');
  const sheets = xml(await workbook.async('string')).getElementsByTagName('sheet');
  const relations = xml(await links.async('string')).getElementsByTagName('Relationship');
  const dictionary = zip.file('xl/sharedStrings.xml');
  const strings = dictionary ? Array.from(xml(await dictionary.async('string')).getElementsByTagName('si'),
    element => Array.from(element.getElementsByTagName('t'), part => part.textContent ?? '').join('')) : [];
  const result: { name: string; rows: string[][] }[] = [];
  for (const sheet of Array.from(sheets).slice(0, 40)) {
    const href = Array.from(relations).find(relation => relation.getAttribute('Id') === sheet.getAttribute('r:id'))?.getAttribute('Target');
    if (!href) continue;
    const file = zip.file(href.startsWith('/') ? href.slice(1) : 'xl/' + href);
    if (!file) continue;
    const elements = xml(await file.async('string')).getElementsByTagName('row');
    if (elements.length > 10000) throw new Error('Há mais de 10.000 linhas em uma aba.');
    const rows = Array.from(elements, element => {
      const cells: string[] = [];
      for (const cell of Array.from(element.getElementsByTagName('c'))) {
        const address = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
        const index = address ? [...address].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1 : cells.length;
        if (index < 0 || index >= 300) continue;
        const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        const kind = cell.getAttribute('t');
        cells[index] = kind === 's' ? strings[Number(value)] ?? '' : kind === 'inlineStr'
          ? Array.from(cell.getElementsByTagName('t'), part => part.textContent ?? '').join('') : value;
      }
      return cells;
    });
    result.push({ name: sheet.getAttribute('name') ?? 'Aba', rows });
  }
  return result;
}

export function parseLabSheet(rows: string[][], sheet: string): LabRow[] {
  const aliases = {
    code: /^(?:(?:codigo|id)\s*(?:da\s*)?amostra|amostra|sample(?: id| code)?|codigo|identificacao(?: da amostra)?)$/,
    parameter: /^(parametro|analito|elemento|parameter|nutriente|organismo|especie|genero)$/,
    value: /^(valor|resultado|value|populacao)$/,
    unit: /^(unidade|unit)$/,
    method: /^(metodo|method|extrator)$/,
    material: /^(material|matriz|material analisado)$/,
  };
  const headerIndex = rows.findIndex(row => row.some(value => aliases.code.test(normalize(value ?? ''))));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const column = (key: keyof typeof aliases) => header.findIndex(value => aliases[key].test(normalize(value ?? '')));
  const codeIndex = column('code'), parameterIndex = column('parameter'), valueIndex = column('value');
  const unitIndex = column('unit'), methodIndex = column('method'), materialIndex = column('material');
  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    const reportedCode = row[codeIndex]?.trim();
    if (!reportedCode) return [];
    const source = sheet + ': linha ' + (headerIndex + index + 2);
    const result = (label: string, original: string, unit: string, method: string, material: string, column?: number): LabRow => {
      const parameter = names.get(normalize(label)) ?? label.trim();
      return {
        reported_code: reportedCode, parameter, ...(parameter !== label.trim() ? { original_parameter: label.trim() } : {}),
        original_value: original, value: labNumber(original), unit, method, material,
        source: column === undefined ? source : `${source}, coluna ${column + 1}`,
      };
    };
    if (parameterIndex >= 0 && valueIndex >= 0) {
      if (!row[parameterIndex]?.trim()) return [];
      return [result(row[parameterIndex], row[valueIndex] ?? '', row[unitIndex] ?? '', row[methodIndex] ?? '', row[materialIndex] ?? '')];
    }
    return header.flatMap((heading, i) => {
      if (!heading || i === codeIndex || i === unitIndex || i === methodIndex || i === materialIndex || !row[i]?.trim() ||
        /^(talhao|fazenda|data|profundidade|observacoes?|identificador|status|cultura|laboratorio)$/i.test(normalize(heading))) return [];
      const unitInHeading = heading.match(/^(.*?)\s*[([]([^\])]+)[\])]\s*$/);
      return [result(unitInHeading?.[1] ?? heading, row[i], unitInHeading?.[2] ?? row[unitIndex] ?? '', row[methodIndex] ?? '', row[materialIndex] ?? '', i)];
    });
  });
}

export async function readLabWorkbook(file: File) {
  if (file.size < 1 || file.size > 2000000) throw new Error('Selecione um laudo de até 2 MB.');
  const data = await file.arrayBuffer();
  const sheets = /\.xlsx$/i.test(file.name) ? await readXlsx(data)
    : /\.xls$/i.test(file.name) ? await readLegacyXls(data)
    : /\.csv$/i.test(file.name) ? [{ name: 'CSV', rows: readCsv(new TextDecoder().decode(data)) }]
      : (() => { throw new Error('Selecione Excel XLS, XLSX ou CSV.'); })();
  const rows = sheets.flatMap(sheet => parseLabSheet(sheet.rows, sheet.name));
  if (!rows.length) throw new Error('Nenhum resultado reconhecido. Use um cabeçalho com Amostra e colunas de parâmetros, ou Amostra, Parâmetro e Resultado.');
  if (rows.length > 2000) throw new Error('O laudo contém mais de 2.000 resultados. Divida o arquivo.');
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return { rows, original: btoa(binary) };
}

async function readLegacyXls(data: ArrayBuffer) {
  const magic = [208, 207, 17, 224, 161, 177, 26, 225];
  if (!magic.every((byte, index) => new Uint8Array(data)[index] === byte)) throw new Error('Arquivo XLS inválido ou formato Excel antigo sem contêiner OLE.');
  const { read, utils } = await import('xlsx');
  const workbook = read(data, { type: 'array', sheetRows: 10001, cellHTML: false, cellFormula: false, cellStyles: false });
  if (workbook.SheetNames.length > 40) throw new Error('O arquivo ultrapassa 40 abas.');
  let cells = 0;
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    if (!sheet['!ref']) return { name, rows: [] };
    const range = utils.decode_range(sheet['!ref']);
    if (range.e.r >= 10000 || range.e.c >= 300) throw new Error('A aba ultrapassa o limite de 10.000 linhas ou 300 colunas.');
    cells += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cells > 400000) throw new Error('O arquivo XLS ultrapassa o limite de 400.000 células.');
    return { name, rows: utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) };
  });
}
