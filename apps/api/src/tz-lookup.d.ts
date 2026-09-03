// `tz-lookup` (6.1.25) ships no type declarations. It is a single CommonJS
// function: given a latitude and longitude it returns the IANA timezone
// name for that point, entirely offline (Foundation §9 "no external
// geocoding"). Used by GymsService.submitGym (AR-51, BL-x04).
declare module 'tz-lookup' {
  export default function tzlookup(latitude: number, longitude: number): string;
}
