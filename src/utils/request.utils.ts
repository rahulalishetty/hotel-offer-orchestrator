export function createHotelWorkflowId(city: string): string {
  return `hotel-offers-${city.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
