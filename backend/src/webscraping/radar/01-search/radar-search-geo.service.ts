import { Injectable } from '@nestjs/common';
import { BRAZIL_CITY_COORDINATES } from '../../brazil-city-coordinates';
import type { RegionalCity } from '../shared/radar-types';

const RADAR_REGION_MAX_CITIES = 30;

export type RadarSearchGeoHost = {
  normalizeCoordinate: (value: unknown) => number | null;
  normalizeRadiusKm: (value: unknown) => number;
};

function normalizeLookupValue(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class RadarSearchGeoService {
  haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const earthKm = 6371;
    const toRad = (degrees: number) => degrees * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  findBrazilCityCoordinate(city: string, state: string) {
    const normalizedCity = normalizeLookupValue(city);
    const normalizedState = String(state || '').trim().toUpperCase();
    if (!normalizedCity || !normalizedState) return null;
    const row = BRAZIL_CITY_COORDINATES.find(([rowState, rowCity]) => (
      rowState === normalizedState && normalizeLookupValue(rowCity) === normalizedCity
    ));
    if (!row) return null;
    return { state: row[0], city: row[1], lat: row[2], lng: row[3] };
  }

  resolveSearchOrigin(input: {
    city: string;
    state: string;
    originLat?: number | null;
    originLng?: number | null;
  }, host: RadarSearchGeoHost) {
    const cityOrigin = this.findBrazilCityCoordinate(input.city, input.state);
    const suppliedLat = host.normalizeCoordinate(input.originLat);
    const suppliedLng = host.normalizeCoordinate(input.originLng);
    if (cityOrigin && suppliedLat != null && suppliedLng != null) {
      const distanceFromSelectedCity = this.haversineDistanceKm(cityOrigin.lat, cityOrigin.lng, suppliedLat, suppliedLng);
      if (distanceFromSelectedCity <= 20) {
        return { city: input.city, state: input.state, lat: suppliedLat, lng: suppliedLng };
      }
      return cityOrigin;
    }
    if (cityOrigin) return cityOrigin;
    if (suppliedLat != null && suppliedLng != null) {
      return { city: input.city, state: input.state, lat: suppliedLat, lng: suppliedLng };
    }
    return null;
  }

  resolveRegionalCities(input: {
    city: string;
    state: string;
    radiusKm: number;
    originLat?: number | null;
    originLng?: number | null;
  }, host: RadarSearchGeoHost): RegionalCity[] {
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim().toUpperCase();
    const radiusKm = host.normalizeRadiusKm(input.radiusKm);
    if (!city || !state || radiusKm <= 0) return [];

    const normalizedCity = normalizeLookupValue(city);
    const origin = this.resolveSearchOrigin({ city, state, originLat: input.originLat, originLng: input.originLng }, host);
    if (!origin) return [];

    const maxCities = radiusKm <= 25 ? 10 : radiusKm <= 50 ? 18 : RADAR_REGION_MAX_CITIES;
    const seen = new Set<string>();
    const nearby = BRAZIL_CITY_COORDINATES
      .map(([rowState, rowCity, lat, lng]) => {
        const distanceKm = this.haversineDistanceKm(origin.lat, origin.lng, lat, lng);
        return {
          city: rowCity,
          state: rowState,
          normalizedCity: normalizeLookupValue(rowCity),
          distanceKm: Number(distanceKm.toFixed(1)),
        };
      })
      .filter((row) => row.distanceKm <= radiusKm && row.state === state)
      .sort((left, right) => left.distanceKm - right.distanceKm || left.city.localeCompare(right.city, 'pt-BR'));

    const ordered: RegionalCity[] = [{
      city,
      state,
      normalizedCity,
      distanceKm: 0,
    }, ...nearby];
    return ordered.filter((row) => {
      const key = `${row.state}:${row.normalizedCity}`;
      if (!row.normalizedCity || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxCities);
  }
}
