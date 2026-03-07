// API functions for Merge settings

const getApiUrl = () => window.location.origin;

export type FrequencyMode = 'low' | 'medium' | 'high';

export interface MergeSettings {
  userId: string;
  frequency: FrequencyMode;
  theme: 'light' | 'dark';
}

/**
 * Fetch user settings from the API
 */
export const fetchUserSettings = async (userId: string): Promise<MergeSettings> => {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/api/settings?userId=${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }

  return response.json();
};

/**
 * Update user settings (partial update)
 */
export const updateUserSettings = async (
  userId: string,
  updates: Partial<Omit<MergeSettings, 'userId'>>
): Promise<MergeSettings> => {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...updates }),
  });

  if (!response.ok) {
    throw new Error('Failed to update settings');
  }

  return response.json();
};

/**
 * Update only the frequency setting
 */
export const updateFrequency = async (
  userId: string,
  frequency: FrequencyMode
): Promise<MergeSettings> => {
  return updateUserSettings(userId, { frequency });
};

/**
 * Update only the theme setting
 */
export const updateTheme = async (
  userId: string,
  theme: 'light' | 'dark'
): Promise<MergeSettings> => {
  return updateUserSettings(userId, { theme });
};
