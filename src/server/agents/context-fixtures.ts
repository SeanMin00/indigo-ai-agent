import type { RawContextInput } from "@/types/live-agent";

export const emergencyVehicleContextInputFixture: RawContextInput = {
  scenarioHint: "emergency_vehicle",
  city: "NYC",
  neighborhood: "Chelsea",
  venueType: "street",
  userSituationHint: "on_foot",
  timeHint: "afternoon",
  weatherHint: "clear",
  latitude: 40.7465,
  longitude: -74.0014,
  notes: ["Demo scenario: outdoors hazard detection"],
};

export const hospitalPaContextInputFixture: RawContextInput = {
  scenarioHint: "hospital_pa",
  city: "NYC",
  neighborhood: "Kips Bay",
  venueType: "hospital",
  userSituationHint: "waiting_room",
  timeHint: "morning",
  weatherHint: "clear",
  notes: ["Demo scenario: hospital waiting room announcement"],
};

export const airportPaContextInputFixture: RawContextInput = {
  scenarioHint: "airport_pa",
  city: "NYC",
  neighborhood: "JFK Airport",
  venueType: "airport",
  userSituationHint: "transit",
  timeHint: "evening",
  weatherHint: "rain",
  notes: ["Demo scenario: gate change announcement"],
};

export const homeAwarenessContextInputFixture: RawContextInput = {
  scenarioHint: "home",
  city: "NYC",
  neighborhood: "Chelsea",
  venueType: "home",
  userSituationHint: "indoors",
  timeHint: "evening",
  weatherHint: "clear",
  notes: ["Demo scenario: home awareness monitoring"],
};
