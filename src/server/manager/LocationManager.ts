/**
 * LocationManager — handles GPS coordinates, reverse geocoding, and location context.
 * Adapted from New-Mentra-AI's LocationManager for Merge.
 *
 * - Receives passive GPS updates from the SDK
 * - Lazily reverse-geocodes only when needed (with caching)
 * - Provides location context for the initial agent's prompt
 */

import { Client } from "@googlemaps/google-maps-services-js";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const mapsClient = new Client({});

// Cache settings
const GEOCODE_CACHE_DURATION_MS = 10 * 60 * 1000;  // 10 minutes
const MIN_MOVEMENT_DEGREES = 0.01;                   // ~1km

/**
 * Complete location context
 */
export interface LocationContext {
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
  streetAddress?: string;
  neighborhood?: string;
  timezone?: string;
  geocodedAt: number;
}

/**
 * LocationManager — per-user location state with cached reverse geocoding.
 */
export class LocationManager {
  private currentLat: number | null = null;
  private currentLng: number | null = null;
  private userTimezone: string | null = null;
  private cachedContext: LocationContext | null = null;
  private lastGeocodedLat: number | null = null;
  private lastGeocodedLng: number | null = null;

  constructor(private userId: string) {}

  /** Update raw coordinates (called on passive SDK location events) */
  updateCoordinates(lat: number, lng: number): void {
    this.currentLat = lat;
    this.currentLng = lng;
  }

  /** Check if we have valid coordinates */
  hasLocation(): boolean {
    return this.currentLat !== null && this.currentLng !== null;
  }

  /** Get current raw coordinates */
  getCoordinates(): { lat: number; lng: number } | null {
    if (!this.hasLocation()) return null;
    return { lat: this.currentLat!, lng: this.currentLng! };
  }

  /** Get cached context without making API calls */
  getCachedContext(): LocationContext | null {
    return this.cachedContext;
  }

  /** Get timezone */
  getTimezone(): string | null {
    return this.cachedContext?.timezone ?? this.userTimezone;
  }

  /** Set timezone (from SDK settings) */
  setTimezone(timezone: string): void {
    this.userTimezone = timezone;
    if (this.cachedContext) {
      this.cachedContext.timezone = timezone;
    }
  }

  /**
   * Fetch location context if needed (lazy geocoding with caching).
   * Only makes API calls if cache is stale or user has moved significantly.
   */
  async fetchContextIfNeeded(): Promise<LocationContext | null> {
    if (!this.hasLocation()) return null;

    const lat = this.currentLat!;
    const lng = this.currentLng!;

    if (!this.shouldRefreshGeocoding(lat, lng) && this.cachedContext) {
      return this.cachedContext;
    }

    await this.refreshGeocoding(lat, lng);
    return this.cachedContext;
  }

  /** Check if geocoding should be refreshed */
  private shouldRefreshGeocoding(lat: number, lng: number): boolean {
    if (!this.cachedContext || this.lastGeocodedLat === null) return true;

    const cacheAge = Date.now() - this.cachedContext.geocodedAt;
    if (cacheAge > GEOCODE_CACHE_DURATION_MS) return true;

    const latDiff = Math.abs(lat - this.lastGeocodedLat!);
    const lngDiff = Math.abs(lng - this.lastGeocodedLng!);
    if (latDiff > MIN_MOVEMENT_DEGREES || lngDiff > MIN_MOVEMENT_DEGREES) return true;

    return false;
  }

  /** Reverse geocode via Google Maps API */
  private async refreshGeocoding(lat: number, lng: number): Promise<void> {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('[LocationManager] GOOGLE_MAPS_API_KEY not configured');
      this.initializeDefaults(lat, lng);
      return;
    }

    try {
      const response = await mapsClient.reverseGeocode({
        params: {
          latlng: { lat, lng },
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 5000,
      });

      if (response.data.status !== 'OK' || !response.data.results?.length) {
        console.warn(`[LocationManager] Geocoding failed: ${response.data.status}`);
        this.initializeDefaults(lat, lng);
        return;
      }

      const components = response.data.results[0].address_components;

      let streetNumber = '';
      let route = '';
      let neighborhood = '';
      let city = 'Unknown';
      let state = 'Unknown';
      let country = 'Unknown';

      for (const component of components) {
        const types = component.types as string[];
        if (types.includes('street_number')) {
          streetNumber = component.long_name;
        } else if (types.includes('route')) {
          route = component.long_name;
        } else if (types.includes('neighborhood') || types.includes('sublocality')) {
          neighborhood = component.long_name;
        } else if (types.includes('locality')) {
          city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          state = component.long_name;
        } else if (types.includes('country')) {
          country = component.long_name;
        }
      }

      const streetAddress = [streetNumber, route].filter(Boolean).join(' ') || undefined;

      this.cachedContext = {
        lat,
        lng,
        city,
        state,
        country,
        streetAddress,
        neighborhood: neighborhood || undefined,
        timezone: this.userTimezone ?? undefined,
        geocodedAt: Date.now(),
      };

      this.lastGeocodedLat = lat;
      this.lastGeocodedLng = lng;

      console.log(`[LocationManager] Geocoded: ${streetAddress || ''} ${city}, ${state}`);

    } catch (error) {
      console.error('[LocationManager] Geocoding error:', error);
      this.initializeDefaults(lat, lng);
    }
  }

  /** Initialize context with defaults when geocoding fails */
  private initializeDefaults(lat: number, lng: number): void {
    this.cachedContext = {
      lat,
      lng,
      city: 'Unknown',
      state: 'Unknown',
      country: 'Unknown',
      geocodedAt: Date.now(),
    };
    this.lastGeocodedLat = lat;
    this.lastGeocodedLng = lng;
  }

  /** Format location context as a string for the agent prompt */
  formatForPrompt(): string | null {
    if (!this.cachedContext) return null;
    const loc = this.cachedContext;

    let parts: string[] = [];
    if (loc.streetAddress) parts.push(loc.streetAddress);
    if (loc.neighborhood) parts.push(loc.neighborhood);
    parts.push(`${loc.city}, ${loc.state}, ${loc.country}`);

    let result = parts.join(', ');
    result += ` (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`;

    return result;
  }

  /** Clean up */
  destroy(): void {
    this.cachedContext = null;
    this.currentLat = null;
    this.currentLng = null;
    this.lastGeocodedLat = null;
    this.lastGeocodedLng = null;
  }
}
