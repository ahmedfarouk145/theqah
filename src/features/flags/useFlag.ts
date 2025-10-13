// src/features/flags/useFlag.ts
import { useState, useEffect } from "react";

// Feature flags configuration
const FLAGS = {
  DASHBOARD_V2: false, // OFF by default
} as const;

type FlagName = keyof typeof FLAGS;

/**
 * Hook to check if a feature flag is enabled.
 * Can be extended to read from Firestore, Remote Config, or environment variables.
 */
export function useFlag(flagName: FlagName): boolean {
  const [enabled, setEnabled] = useState<boolean>(FLAGS[flagName]);

  useEffect(() => {
    // Check environment variable override
    const envKey = `NEXT_PUBLIC_FLAG_${flagName}`;
    const envValue = process.env[envKey];
    
    if (envValue === "true" || envValue === "1") {
      setEnabled(true);
    } else if (envValue === "false" || envValue === "0") {
      setEnabled(false);
    }

    // In the future, you can fetch from Firestore or Remote Config here
    // Example:
    // const checkRemoteFlag = async () => {
    //   const doc = await getDoc(doc(db, "config", "flags"));
    //   if (doc.exists() && doc.data()[flagName] !== undefined) {
    //     setEnabled(doc.data()[flagName]);
    //   }
    // };
    // checkRemoteFlag();
  }, [flagName]);

  return enabled;
}

/**
 * Synchronous function to check flag status (for SSR or non-hook contexts)
 */
export function isFlagEnabled(flagName: FlagName): boolean {
  // Check environment variable
  const envKey = `NEXT_PUBLIC_FLAG_${flagName}`;
  const envValue = process.env[envKey];
  
  if (envValue === "true" || envValue === "1") {
    return true;
  } else if (envValue === "false" || envValue === "0") {
    return false;
  }

  return FLAGS[flagName];
}
