export interface ScoreItem {
  label: string;
  anchor: string;
  points: number;
  earned: boolean;
}

export interface ScoreResult {
  score: number;
  items: ScoreItem[];
}

function wordCount(text: string | undefined | null): number {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function computeProfileScore(profile: {
  company_name?: string | null;
  company_overview?: string | null;
  therapeutic_areas?: string[] | null;
  assay_types?: string[] | null;
  team_members?: { name?: string }[] | null;
  facility_description?: string | null;
  accreditations?: string[] | null;
  geographic_reach?: string | null;
}): ScoreResult {
  const teamCount = (profile.team_members ?? []).filter(m => m.name?.trim()).length;

  const items: ScoreItem[] = [
    {
      label: 'Company name filled',
      anchor: 'company-basics',
      points: 10,
      earned: !!profile.company_name?.trim(),
    },
    {
      label: 'Company overview (50+ words)',
      anchor: 'company-basics',
      points: 15,
      earned: wordCount(profile.company_overview) >= 50,
    },
    {
      label: 'At least 3 therapeutic areas',
      anchor: 'capabilities',
      points: 10,
      earned: (profile.therapeutic_areas ?? []).length >= 3,
    },
    {
      label: 'At least 3 assay types',
      anchor: 'capabilities',
      points: 15,
      earned: (profile.assay_types ?? []).length >= 3,
    },
    {
      label: 'At least 1 team member',
      anchor: 'team',
      points: 10,
      earned: teamCount >= 1,
    },
    {
      label: 'At least 3 team members',
      anchor: 'team',
      points: 10,
      earned: teamCount >= 3,
    },
    {
      label: 'Facility description (30+ words)',
      anchor: 'facility',
      points: 15,
      earned: wordCount(profile.facility_description) >= 30,
    },
    {
      label: 'At least 1 accreditation',
      anchor: 'facility',
      points: 10,
      earned: (profile.accreditations ?? []).length >= 1,
    },
    {
      label: 'Geographic reach filled',
      anchor: 'company-basics',
      points: 5,
      earned: !!profile.geographic_reach?.trim(),
    },
  ];

  const score = items.reduce((sum, item) => sum + (item.earned ? item.points : 0), 0);
  return { score, items };
}
