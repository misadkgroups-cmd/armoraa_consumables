import { useState, useRef, useEffect } from 'react';

const SearchableDropdown = ({ options = [], value, onChange, placeholder = "Search and select...", displayKey = "name", valueKey = "id", required = false, disabled = false, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find(opt => String(opt[valueKey]) === String(value));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchText('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      if (!value) setSearchText('');
    }
  }, [isOpen, value]);

  const filteredOptions = options.filter(opt => {
    const searchLower = searchText.toLowerCase();
    const displayValue = opt[displayKey] || '';
    return displayValue.toLowerCase().includes(searchLower);
  });

  const handleInputChange = (e) => {
    const text = e.target.value;
    setSearchText(text);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    if (!isOpen) {
      setIsOpen(true);
      if (selectedOption) {
        setSearchText(selectedOption[displayKey] || '');
      }
    }
  };

  const handleOptionClick = (option) => {
    onChange(option[valueKey]);
    setIsOpen(false);
    setSearchText('');
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        handleOptionClick(filteredOptions[highlightedIndex]);
      } else if (filteredOptions.length === 1) {
        handleOptionClick(filteredOptions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchText('');
      setHighlightedIndex(-1);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchText('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={dropdownRef} className={`searchable-dropdown ${className}`} style={{ position: 'relative' }}>
      <div
        className="form-input"
        style={{ 
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: disabled ? 'var(--color-tint-2, #f5f5f5)' : '',
          opacity: disabled ? 0.7 : 1
        }}
        onMouseDown={(e) => { if (!disabled) e.stopPropagation(); }}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchText : (selectedOption ? selectedOption[displayKey] : '')}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            flex: 1,
            fontSize: '13px',
            color: 'var(--color-text)',
            cursor: disabled ? 'not-allowed' : 'text'
          }}
        />
        {!disabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-muted)',
                  fontSize: '16px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            )}
            <span style={{ 
              color: 'var(--color-muted)', 
              fontSize: '12px',
              transition: 'transform 0.2s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
            }}>
              ▼
            </span>
          </div>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            padding: '4px 0'
          }}
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option[valueKey]}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: index === highlightedIndex ? 'var(--color-tint)' : 'transparent',
                fontSize: '13px',
                color: 'var(--color-text)',
                transition: 'background 0.15s'
              }}
            >
              {option[displayKey]}
            </div>
          ))}
        </div>
      )}

      {isOpen && filteredOptions.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            padding: '12px',
            textAlign: 'center',
            color: 'var(--color-muted)',
            fontSize: '13px',
            zIndex: 1000
          }}
        >
          No results found
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;