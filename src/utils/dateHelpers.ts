export function dateToInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';

  let dateObj: Date;

  if (typeof date === 'string') {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = date;
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function inputValueToDate(inputValue: string): Date {
  const [year, month, day] = inputValue.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateToISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
}

export function dateToDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null;

  let dateObj: Date;

  if (typeof date === 'string') {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = date;
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDateForDisplay(date: Date | string | null | undefined, locale: string = 'pt-BR'): string {
  if (!date) return '';

  let dateObj: Date;

  if (typeof date === 'string') {
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    dateObj = new Date(year, month - 1, day);
  } else {
    dateObj = date;
  }

  return dateObj.toLocaleDateString(locale);
}

export function parseDate(dateString: string | null | undefined): Date | undefined {
  if (!dateString) return undefined;

  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}
