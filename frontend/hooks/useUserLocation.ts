"use client";

import { useState, useCallback } from "react";

export interface GeoLocationState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  error: string | null;
  isLocating: boolean;
}

export function useUserLocation() {
  const [location, setLocation] = useState<GeoLocationState>({
    lat: null,
    lon: null,
    accuracy: null,
    error: null,
    isLocating: false,
  });

  const getLivePosition = useCallback((): Promise<[number, number]> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        const err = "Geolocation is not supported by your browser.";
        setLocation((prev) => ({ ...prev, error: err, isLocating: false }));
        return reject(new Error(err));
      }

      setLocation((prev) => ({ ...prev, isLocating: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setLocation({
            lat: latitude,
            lon: longitude,
            accuracy,
            error: null,
            isLocating: false,
          });
          resolve([latitude, longitude]);
        },
        (err) => {
          setLocation((prev) => ({ ...prev, error: err.message, isLocating: false }));
          reject(err);
        },
        {
          enableHighAccuracy: true, // Forces phone/laptop GPS hardware
          timeout: 10000,
          maximumAge: 5000,
        }
      );
    });
  }, []);

  return { location, getLivePosition };
}
