/** The one main category the AI picks for each photo, used to filter photos and places. */
export const PHOTO_KINDS = [
  { id: 'food', emoji: '🍽️', label: 'Food & drink', hint: 'meals, cafés, markets, drinks' },
  { id: 'sights', emoji: '🏛️', label: 'Sights', hint: 'landmarks, monuments, churches, museums, art' },
  { id: 'city', emoji: '🏙️', label: 'City', hint: 'streets, squares, buildings, shops, views over a town' },
  { id: 'nature', emoji: '🌲', label: 'Nature', hint: 'mountains, forests, lakes, countryside, animals' },
  { id: 'beach', emoji: '🏖️', label: 'Beach & sea', hint: 'beaches, coast, boats, pools' },
  { id: 'activity', emoji: '🚴', label: 'Activities', hint: 'sport, hiking, games, tours, attractions' },
  { id: 'nightlife', emoji: '🎉', label: 'Evenings out', hint: 'bars, concerts, festivals, parties' },
  { id: 'people', emoji: '🧑‍🤝‍🧑', label: 'People', hint: 'photos mainly of people: selfies, group shots' },
  { id: 'travel', emoji: '🚆', label: 'On the way', hint: 'planes, trains, cars, stations, airports, roads' },
  { id: 'stay', emoji: '🛏️', label: 'Where we stayed', hint: 'hotel rooms, apartments, campsites' },
  { id: 'other', emoji: '📷', label: 'Other', hint: 'anything else' },
] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number]['id'];

export const KIND_IDS = PHOTO_KINDS.map((k) => k.id) as PhotoKind[];

export function kindInfo(id: string | undefined) {
  return PHOTO_KINDS.find((k) => k.id === id);
}
