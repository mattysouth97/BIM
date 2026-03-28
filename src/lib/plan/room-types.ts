export const ROOM_TYPES = {
  living:   { name: "Living",   nameKo: "거실",  color: 0x4caf50 },
  bedroom:  { name: "Bedroom",  nameKo: "침실",  color: 0x2196f3 },
  kitchen:  { name: "Kitchen",  nameKo: "주방",  color: 0xff9800 },
  bathroom: { name: "Bathroom", nameKo: "욕실",  color: 0x9c27b0 },
  custom:   { name: "Custom",   nameKo: "기타",  color: 0x607d8b },
} as const;

export type RoomType = keyof typeof ROOM_TYPES;
