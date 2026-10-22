"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Marker } from "react-leaflet";

type Position = [number, number]; // Leaflet order: [latitude, longitude]

type JourneyStop = {
  id: string;
  position: Position;
  routeDistance: number;
  arrivalSoc?: number;
  targetSoc?: number;
};

type Phase =
  | {
      kind: "drive";
      from: number;
      to: number;
      startMs: number;
      durationMs: number;
    }
  | {
      kind: "charge";
      distance: number;
      stopIndex: number;
      startMs: number;
      durationMs: number;
    };

type JourneyFrame = {
  distance: number;
  activeStopIndex: number;
  chargeProgress: number;
};

type Props = {
  positions: Position[];
  chargingStops: any[];
  journeyRunId: number;
};

const MAX_STOP_DISTANCE_FROM_ROUTE_M = 250;
const DRIVE_DURATION_MS = 42_000;
const CHARGE_DURATION_MS = 10_000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function metersBetween(a: Position, b: Position) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const lat1 = a[0] * rad;
  const lat2 = b[0] * rad;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getStopPosition(stop: any): Position | null {
  let lat: number;
  let lng: number;

  // Physics stop coordinates may be [longitude, latitude].
  if (Array.isArray(stop.coordinates) && stop.coordinates.length >= 2) {
    lng = Number(stop.coordinates[0]);
    lat = Number(stop.coordinates[1]);
  } else {
    lat = Number(stop.lat);
    lng = Number(stop.lon ?? stop.lng);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function cumulativeRouteDistances(positions: Position[]) {
  const cumulative = [0];

  for (let i = 1; i < positions.length; i++) {
    cumulative.push(
      cumulative[i - 1] + metersBetween(positions[i - 1], positions[i])
    );
  }

  return cumulative;
}

function projectStopOntoRoute(
  stopPosition: Position,
  positions: Position[],
  cumulative: number[]
) {
  let nearestOffset = Infinity;
  let distanceAlongRoute = 0;

  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i];
    const b = positions[i + 1];

    const metersPerLng = 111_320 * Math.cos((a[0] * Math.PI) / 180);
    const metersPerLat = 110_540;

    const dx = (b[1] - a[1]) * metersPerLng;
    const dy = (b[0] - a[0]) * metersPerLat;
    const px = (stopPosition[1] - a[1]) * metersPerLng;
    const py = (stopPosition[0] - a[0]) * metersPerLat;
    const segmentLengthSquared = dx * dx + dy * dy || 1;
    const t = clamp(
      (px * dx + py * dy) / segmentLengthSquared,
      0,
      1
    );
    const offset = Math.hypot(px - t * dx, py - t * dy);

    if (offset < nearestOffset) {
      nearestOffset = offset;
      distanceAlongRoute =
        cumulative[i] + t * metersBetween(a, b);
    }
  }

  return { offsetMeters: nearestOffset, distanceAlongRoute };
}

function pointAtDistance(
  positions: Position[],
  cumulative: number[],
  distance: number
): Position {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = clamp(distance, 0, total);

  for (let i = 0; i < positions.length - 1; i++) {
    if (target <= cumulative[i + 1]) {
      const segmentLength = cumulative[i + 1] - cumulative[i] || 1;
      const progress = clamp(
        (target - cumulative[i]) / segmentLength,
        0,
        1
      );

      return [
        positions[i][0] +
          (positions[i + 1][0] - positions[i][0]) * progress,
        positions[i][1] +
          (positions[i + 1][1] - positions[i][1]) * progress,
      ];
    }
  }

  return positions[positions.length - 1];
}

function getFrameAtTime(
  timeMs: number,
  phases: Phase[],
  totalDistance: number
): JourneyFrame {
  const phase = phases.find(
    (item) => timeMs <= item.startMs + item.durationMs
  );

  if (!phase) {
    return {
      distance: totalDistance,
      activeStopIndex: -1,
      chargeProgress: 0,
    };
  }

  const progress = clamp(
    (timeMs - phase.startMs) / Math.max(phase.durationMs, 1),
    0,
    1
  );

  if (phase.kind === "charge") {
    return {
      distance: phase.distance,
      activeStopIndex: phase.stopIndex,
      chargeProgress: progress,
    };
  }

  return {
    distance: phase.from + (phase.to - phase.from) * progress,
    activeStopIndex: -1,
    chargeProgress: 0,
  };
}

export default function RouteJourneyAnimation({
  positions,
  chargingStops,
  journeyRunId,
}: Props) {
  const cumulative = useMemo(
    () => cumulativeRouteDistances(positions),
    [positions]
  );

  const totalDistance = cumulative[cumulative.length - 1] ?? 0;

  // Stops come from the physics engine's charging plan or fallback midpoint stop.
  // Guarantees that the vehicle always stops for 10 seconds to charge to full.
  const selectedStops = useMemo(() => {
    const candidates: JourneyStop[] = chargingStops
      .flatMap((stop, index) => {
        const position = getStopPosition(stop);
        if (!position) return [];

        const projected = projectStopOntoRoute(
          position,
          positions,
          cumulative
        );

        // Don't animate a physics stop if it is visibly far from this road route.
        if (projected.offsetMeters > MAX_STOP_DISTANCE_FROM_ROUTE_M) {
          return [];
        }

        const arrivalSoc = Number(
          stop.arrival_soc_percent ?? stop.arrival_soc
        );

        return [
          {
            id: String(
              stop.id ?? stop.station_id ?? `planned-stop-${index}`
            ),
            position,
            routeDistance: projected.distanceAlongRoute,
            arrivalSoc: Number.isFinite(arrivalSoc)
              ? clamp(arrivalSoc, 0, 95)
              : 20,
            targetSoc: 100,
          },
        ];
      })
      .sort((a, b) => a.routeDistance - b.routeDistance);

    if (candidates.length === 0) {
      if (totalDistance > 0) {
        // Fallback midpoint stop along the actual road geometry so the user always sees the 10-second charging animation
        const midDist = totalDistance * 0.5;
        const midPos = pointAtDistance(positions, cumulative, midDist);
        return [
          {
            id: "corridor-charging-stop",
            position: midPos,
            routeDistance: midDist,
            arrivalSoc: 20,
            targetSoc: 100,
          },
        ];
      }
      return [];
    }

    // Pick the most central planned charging stop along the journey
    const bestStop = candidates.reduce((prev, curr) =>
      Math.abs(curr.routeDistance - totalDistance * 0.5) <
      Math.abs(prev.routeDistance - totalDistance * 0.5)
        ? curr
        : prev
    );

    return [bestStop];
  }, [chargingStops, positions, cumulative, totalDistance, journeyRunId]);

  const { phases, durationMs } = useMemo(() => {
    const phases: Phase[] = [];
    let elapsed = 0;
    let previousDistance = 0;

    selectedStops.forEach((stop, stopIndex) => {
      const stopDistance = Math.max(previousDistance, stop.routeDistance);
      const driveMs =
        (DRIVE_DURATION_MS * (stopDistance - previousDistance)) /
        Math.max(totalDistance, 1);

      if (driveMs > 0) {
        phases.push({
          kind: "drive",
          from: previousDistance,
          to: stopDistance,
          startMs: elapsed,
          durationMs: driveMs,
        });
        elapsed += driveMs;
      }

      phases.push({
        kind: "charge",
        distance: stopDistance,
        stopIndex,
        startMs: elapsed,
        durationMs: CHARGE_DURATION_MS,
      });
      elapsed += CHARGE_DURATION_MS;
      previousDistance = stopDistance;
    });

    if (previousDistance < totalDistance) {
      const driveMs =
        (DRIVE_DURATION_MS * (totalDistance - previousDistance)) /
        Math.max(totalDistance, 1);

      phases.push({
        kind: "drive",
        from: previousDistance,
        to: totalDistance,
        startMs: elapsed,
        durationMs: driveMs,
      });
      elapsed += driveMs;
    }

    return { phases, durationMs: elapsed };
  }, [selectedStops, totalDistance]);

  const [frame, setFrame] = useState<JourneyFrame>({
    distance: 0,
    activeStopIndex: -1,
    chargeProgress: 0,
  });

  useEffect(() => {
    setFrame({
      distance: 0,
      activeStopIndex: -1,
      chargeProgress: 0,
    });

    if (positions.length < 2 || durationMs <= 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame({
        distance: totalDistance,
        activeStopIndex: -1,
        chargeProgress: 0,
      });
      return;
    }

    let animationFrame = 0;
    let lastUpdate = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;

      if (now - lastUpdate >= 40 || elapsed >= durationMs) {
        setFrame(getFrameAtTime(elapsed, phases, totalDistance));
        lastUpdate = now;
      }

      if (elapsed < durationMs) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [positions.length, durationMs, phases, totalDistance, journeyRunId]);

  if (positions.length < 2) return null;

  const carPosition = pointAtDistance(
    positions,
    cumulative,
    frame.distance
  );
  const nextPosition = pointAtDistance(
    positions,
    cumulative,
    Math.min(totalDistance, frame.distance + 25)
  );

  // Car graphic faces north at zero degrees.
  const deltaLng =
    (nextPosition[1] - carPosition[1]) *
    Math.cos((carPosition[0] * Math.PI) / 180);
  const deltaLat = nextPosition[0] - carPosition[0];
  const heading = (Math.atan2(deltaLng, deltaLat) * 180) / Math.PI;

  const carIcon = L.divIcon({
    className: "route-car-marker-wrap",
    html: `
      <div class="route-car-token" style="transform:rotate(${heading}deg)">
        <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
          <rect x="7" y="9" width="6" height="9" rx="2" fill="#19352b"/>
          <rect x="27" y="9" width="6" height="9" rx="2" fill="#19352b"/>
          <rect x="7" y="23" width="6" height="9" rx="2" fill="#19352b"/>
          <rect x="27" y="23" width="6" height="9" rx="2" fill="#19352b"/>
          <rect x="12" y="3" width="16" height="34" rx="7" fill="#16845b"/>
          <rect x="14" y="9" width="12" height="9" rx="3" fill="#dff5eb"/>
          <rect x="14" y="22" width="12" height="8" rx="3" fill="#0d5d43"/>
          <circle cx="20" cy="5" r="1.5" fill="#fff3b0"/>
        </svg>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  const activeStop = selectedStops[frame.activeStopIndex];

  const chargeIcon = activeStop
    ? (() => {
        const startSoc = activeStop.arrivalSoc ?? 20;
        const endSoc = 100;
        const batteryLevel = clamp(
          startSoc + (endSoc - startSoc) * frame.chargeProgress,
          0,
          100
        );
        const isFull = batteryLevel >= 99.5;

        return L.divIcon({
          className: "route-charge-marker-wrap",
          html: `
            <div class="route-charge-bubble">
              <span class="route-charge-battery" title="Battery: ${Math.round(batteryLevel)}%">
                <span
                  class="route-charge-fill"
                  style="width:${batteryLevel.toFixed(1)}%"
                ></span>
              </span>
              <span style="display:flex;align-items:center;gap:3px;">
                ${
                  isFull
                    ? `<span>Full 100%</span>`
                    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="#16845b" stroke="#16845b" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Charging ${Math.round(batteryLevel)}%</span>`
                }
              </span>
            </div>
          `,
          iconSize: [140, 38],
          iconAnchor: [70, 48],
        });
      })()
    : null;

  return (
    <>
      <Marker position={carPosition} icon={carIcon} interactive={false} />

      {activeStop && chargeIcon && (
        <Marker
          position={carPosition}
          icon={chargeIcon}
          interactive={false}
          zIndexOffset={1000}
        />
      )}
    </>
  );
}
