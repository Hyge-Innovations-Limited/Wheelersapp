import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/**
 * Places a rider saves to book in one tap: Home, Work, and any others they
 * name. Kept on this phone only — the server has no saved places yet, so
 * they do not follow the rider to another phone or to WhatsApp.
 */
export type SavedPlace = {
  id: string;
  /** "Home", "Work", or the rider's own name for it. */
  label: string;
  /** The address as booked: what the search and the price screens take. */
  address: string;
};

const SAVED_PLACES_KEY = "wheelers.saved-places";
export const MAX_SAVED_PLACES = 8;

const listeners = new Set<(places: SavedPlace[]) => void>();

function clean(value: unknown): SavedPlace[] {
  if (!Array.isArray(value)) return [];
  const places: SavedPlace[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, label, address } = item as Partial<SavedPlace>;
    if (typeof id !== "string" || typeof label !== "string" || typeof address !== "string") continue;
    if (!label.trim() || !address.trim()) continue;
    places.push({ id, label: label.trim(), address: address.trim() });
  }
  return places.slice(0, MAX_SAVED_PLACES);
}

/** Home first, then Work, then the rest in the order they were saved. */
export function orderSavedPlaces(places: SavedPlace[]): SavedPlace[] {
  const rank = (place: SavedPlace) => {
    const label = place.label.toLowerCase();
    return label === "home" ? 0 : label === "work" ? 1 : 2;
  };
  return places
    .map((place, index) => ({ place, index }))
    .sort((a, b) => rank(a.place) - rank(b.place) || a.index - b.index)
    .map(({ place }) => place);
}

/**
 * Add a place or replace the one with the same label ("Home" saved twice is
 * one Home). Returns the new list.
 */
export function withSavedPlace(places: SavedPlace[], label: string, address: string): SavedPlace[] {
  const name = label.trim();
  const where = address.trim();
  if (!name || !where) return places;
  const existing = places.find((place) => place.label.toLowerCase() === name.toLowerCase());
  if (existing) {
    return places.map((place) => (place === existing ? { ...place, label: name, address: where } : place));
  }
  if (places.length >= MAX_SAVED_PLACES) return places;
  return [...places, { id: `${Date.now().toString(36)}-${places.length}`, label: name, address: where }];
}

export async function readSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    return raw ? orderSavedPlaces(clean(JSON.parse(raw))) : [];
  } catch {
    return [];
  }
}

async function write(places: SavedPlace[]): Promise<SavedPlace[]> {
  const ordered = orderSavedPlaces(clean(places));
  await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(ordered));
  listeners.forEach((listener) => listener(ordered));
  return ordered;
}

export async function savePlace(label: string, address: string): Promise<SavedPlace[]> {
  return write(withSavedPlace(await readSavedPlaces(), label, address));
}

export async function removeSavedPlace(id: string): Promise<SavedPlace[]> {
  return write((await readSavedPlaces()).filter((place) => place.id !== id));
}

/** The rider's saved places, kept current on every screen showing them. */
export function useSavedPlaces(): {
  places: SavedPlace[];
  save: (label: string, address: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    let live = true;
    void readSavedPlaces().then((stored) => {
      if (live) setPlaces(stored);
    });
    listeners.add(setPlaces);
    return () => {
      live = false;
      listeners.delete(setPlaces);
    };
  }, []);

  const save = useCallback(async (label: string, address: string) => {
    await savePlace(label, address);
  }, []);
  const remove = useCallback(async (id: string) => {
    await removeSavedPlace(id);
  }, []);

  return { places, save, remove };
}
