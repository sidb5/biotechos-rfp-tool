'use client';

import type { TeamMember } from '@cro/types';

interface TeamMemberBlockProps {
  members: TeamMember[];
  onChange: (members: TeamMember[]) => void;
}

const EMPTY_MEMBER: TeamMember = {
  name: '',
  title: '',
  years_experience: 0,
  expertise: '',
};

export default function TeamMemberBlock({ members, onChange }: TeamMemberBlockProps) {
  function update(index: number, field: keyof TeamMember, value: string | number) {
    const updated = members.map((m, i) =>
      i === index ? { ...m, [field]: value } : m
    );
    onChange(updated);
  }

  function addMember() {
    if (members.length >= 10) return;
    onChange([...members, { ...EMPTY_MEMBER }]);
  }

  function removeMember(index: number) {
    onChange(members.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {members.map((member, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-xl p-5 bg-white relative"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Team Member {index + 1}
            </span>
            {members.length > 1 && (
              <button
                type="button"
                onClick={() => removeMember(index)}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={member.name}
                onChange={(e) => update(index, 'name', e.target.value)}
                placeholder="Dr. Jane Smith"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title / role
              </label>
              <input
                type="text"
                value={member.title}
                onChange={(e) => update(index, 'title', e.target.value)}
                placeholder="Principal Scientist, Toxicology"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Years of experience
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={member.years_experience || ''}
                onChange={(e) =>
                  update(index, 'years_experience', parseInt(e.target.value) || 0)
                }
                placeholder="12"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relevant expertise
              </label>
              <input
                type="text"
                value={member.expertise}
                onChange={(e) => update(index, 'expertise', e.target.value)}
                placeholder="GLP in vivo toxicology, NOAEL determination, ICH S7A safety pharmacology"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      ))}

      {members.length < 10 && (
        <button
          type="button"
          onClick={addMember}
          className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800 border border-dashed border-green-300 rounded-xl px-4 py-3 hover:bg-green-50 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Add team member
          <span className="text-gray-400 font-normal">
            ({members.length}/10)
          </span>
        </button>
      )}
    </div>
  );
}
