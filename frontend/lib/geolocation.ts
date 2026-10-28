export interface Coordinates {
  lat: number;
  lng: number;
}

// Messages for the three reasons the browser can refuse (GeolocationPositionError.code)
const MESSAGES: Record<number, string> = {
  1: "Location access is blocked. Allow it in your browser settings, then try again.",
  2: "Your location is not available right now. Try again in a moment.",
  3: "Finding your location took too long. Try again.",
};

// One attempt only. Retrying after a refusal cannot work, and the user can press the button again.
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Your browser does not support location."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) =>
        reject(
          new Error(MESSAGES[error.code] ?? "Could not get your location."),
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
