'use client';

interface TagSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function TagSelect({ options, selected, onChange }: TagSelectProps) {
  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              active
                ? 'bg-green-600 border-green-600 text-white'
                : 'bg-white border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
