import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';

interface Suggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    suburb?: string;
  };
}

interface LocationSearchProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (lat: number, lng: number, address: string) => void;
  color?: 'blue' | 'green' | 'red' | 'purple';
  id?: string;
}

const colorMap = {
  blue:   { ring: 'focus-within:ring-blue-400',   icon: 'text-blue-500',   dot: 'bg-blue-500'   },
  green:  { ring: 'focus-within:ring-green-400',  icon: 'text-green-500',  dot: 'bg-green-500'  },
  red:    { ring: 'focus-within:ring-red-400',     icon: 'text-red-500',    dot: 'bg-red-500'    },
  purple: { ring: 'focus-within:ring-purple-400',  icon: 'text-purple-500', dot: 'bg-purple-500' },
};

export default function LocationSearch({
  placeholder, value, onChange, onSelect, color = 'blue', id
}: LocationSearchProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const c = colorMap[color];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' India')}&format=json&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data: Suggestion[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 420);
  };

  const handleSelect = (s: Suggestion) => {
    const shortName = s.display_name.split(',').slice(0, 2).join(',').trim();
    onChange(shortName);
    onSelect(parseFloat(s.lat), parseFloat(s.lon), shortName);
    setSuggestions([]);
    setOpen(false);
  };

  const getIcon = (type?: string) => {
    if (!type) return '📍';
    if (['university', 'school', 'college'].some(t => type.includes(t))) return '🎓';
    if (['hospital', 'clinic', 'pharmacy'].some(t => type.includes(t))) return '🏥';
    if (['restaurant', 'cafe', 'food'].some(t => type.includes(t))) return '🍽️';
    if (['hotel', 'lodging', 'hostel'].some(t => type.includes(t))) return '🏨';
    if (['park', 'garden', 'forest'].some(t => type.includes(t))) return '🌳';
    if (['railway', 'station', 'airport'].some(t => type.includes(t))) return '🚉';
    if (['mall', 'shop', 'market'].some(t => type.includes(t))) return '🛒';
    return '📍';
  };

  return (
    <div ref={containerRef} className="relative w-full" id={id}>
      <div className={`flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 transition-all ${c.ring} ring-2 ring-transparent`}>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400 min-w-0"
        />
        {loading && <Loader2 size={14} className={`animate-spin flex-shrink-0 ${c.icon}`} />}
        {!loading && value && (
          <button onClick={() => { onChange(''); setSuggestions([]); setOpen(false); }}
            className="text-gray-300 hover:text-gray-500 flex-shrink-0">
            <X size={14} />
          </button>
        )}
        {!loading && !value && <Search size={14} className={`flex-shrink-0 ${c.icon}`} />}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(',');
            const name = parts[0];
            const sub = parts.slice(1, 3).join(',').trim();
            return (
              <button
                key={s.place_id}
                onClick={() => handleSelect(s)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{getIcon(s.type)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{name}</div>
                  {sub && <div className="text-xs text-gray-400 truncate">{sub}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
