import { forwardRef, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface SelectOption {
  value: string;
  label: string;
  searchText?: string;
  content?: ReactNode;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size' | 'children'> {
  options: SelectOption[];
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  options, className = '', label, error, helperText, placeholder, id, style,
  value, defaultValue, disabled, required, onChange, 'aria-label': ariaLabel, ...nativeProps
}, ref) => {
  const { language } = useLanguage();
  const isPt = language === 'pt';
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = inputId + '-options';
  const messageId = inputId + '-message';
  const native = useRef<HTMLSelectElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState<string | undefined>(
    defaultValue === undefined ? undefined : String(defaultValue)
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 });

  const selectedValue = String(value ?? internalValue ?? (placeholder === undefined ? options[0]?.value ?? '' : ''));
  const selected = options.find(option => option.value === selectedValue);
  const searchPlaceholder = isPt ? 'Digite para buscar' : 'Type to search';
  const visible = open && !disabled;
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = options.filter(option => {
    const text = normalize(option.label + ' ' + (option.searchText ?? ''));
    return terms.every(term => text.includes(term));
  });
  const activeIndex = active >= 0 && active < matches.length ? active : -1;
  const validation = error || (invalid && !selectedValue ? (isPt ? 'Selecione uma opção.' : 'Select an option.') : '');
  const message = validation || helperText;

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(-1);
  };

  const updatePosition = () => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
    const below = bottom - rect.bottom - 8;
    const above = rect.top - (viewport?.offsetTop ?? 0) - 8;
    const opensBelow = below >= 160 || below >= above;
    const height = Math.max(0, Math.min(240, opensBelow ? below : above));
    setPosition({
      left: rect.left,
      top: opensBelow ? rect.bottom + 4 : rect.top - height - 4,
      width: rect.width,
      maxHeight: height,
    });
  };

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!visible) return;
    const viewport = window.visualViewport;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
    };
  }, [visible]);

  useEffect(() => {
    const form = native.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => queueMicrotask(() => {
      setInternalValue(native.current?.value);
      setInvalid(false);
      close();
    });
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [value]);

  useEffect(() => {
    if (visible && activeIndex >= 0) {
      document.getElementById(listId + '-' + activeIndex)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, listId, visible]);

  const choose = (option: SelectOption) => {
    const select = native.current;
    if (!select || disabled) return;
    if (select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  };

  return (
    <div className="w-full min-w-0">
      {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>}
      <select
        {...nativeProps}
        hidden
        tabIndex={-1}
        ref={node => {
          native.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        disabled={disabled}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={event => {
          setInternalValue(event.target.value);
          setInvalid(false);
          onChange?.(event);
        }}
        onInvalid={event => {
          event.preventDefault();
          setInvalid(true);
          input.current?.focus();
        }}
      >
        {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>

      <div className="relative">
        <input
          ref={input}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-label={ariaLabel ?? (label || id ? undefined : placeholder ?? searchPlaceholder)}
          aria-expanded={visible}
          aria-controls={visible ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={visible && activeIndex >= 0 ? listId + '-' + activeIndex : undefined}
          aria-required={required}
          aria-invalid={Boolean(validation)}
          aria-describedby={message ? messageId : undefined}
          disabled={disabled}
          value={visible ? query : selected?.label ?? ''}
          placeholder={visible ? searchPlaceholder : placeholder ?? searchPlaceholder}
          style={style}
          className={`h-10 w-full rounded-lg border bg-white py-2 pl-3 pr-8 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${validation ? 'border-danger-500' : 'border-gray-300'} ${className}`}
          onFocus={show}
          onClick={() => { if (!visible) show(); }}
          onBlur={close}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
            if (!visible) show();
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!visible) show();
              if (matches.length) {
                const down = event.key === 'ArrowDown';
                setActive(activeIndex < 0 ? (down ? 0 : matches.length - 1) :
                  (activeIndex + (down ? 1 : -1) + matches.length) % matches.length);
              }
            } else if (event.key === 'Enter' && visible) {
              event.preventDefault();
              if (activeIndex >= 0) choose(matches[activeIndex]);
            } else if (event.key === 'Escape' && visible) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        />
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>

      {visible && createPortal(
        <div id={listId} role="listbox" aria-label={label ?? ariaLabel ?? searchPlaceholder}
          className="fixed z-[1000] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm text-gray-900 shadow-lg"
          style={{ ...position, overscrollBehavior: 'contain' }}
          onMouseDown={event => event.preventDefault()}>
          {matches.map((option, index) => (
            <div key={option.value} id={listId + '-' + index} role="option" aria-selected={option.value === selectedValue}
              aria-label={option.label} onClick={() => choose(option)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 ${index === activeIndex ? 'bg-brand-100' : 'hover:bg-brand-50'}`}>
              {option.content ?? <span className="min-w-0 break-words">{option.label}</span>}
              {option.value === selectedValue && <Check aria-hidden="true" size={16} className="shrink-0 text-brand-700" />}
            </div>
          ))}
          {matches.length === 0 && <div className="px-3 py-2 text-gray-600" role="status">{isPt ? 'Nenhuma opção encontrada' : 'No options found'}</div>}
        </div>,
        document.body
      )}
      {message && <p id={messageId} className={`mt-1 text-xs ${validation ? 'text-danger-600' : 'text-gray-500'}`}>{message}</p>}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;
