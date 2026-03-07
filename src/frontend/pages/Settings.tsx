import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import SettingItem from '../ui/setting-item';
import ToggleSwitch from '../ui/toggle-switch';
import { fetchUserSettings, updateFrequency, updateTheme, type FrequencyMode } from '../api/settings.api';

interface SettingsProps {
  onBack: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  userId: string;
}

const FREQUENCY_LABELS: Record<FrequencyMode, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const FREQUENCY_ORDER: FrequencyMode[] = ['low', 'medium', 'high'];

/**
 * Settings page — frequency toggle (LOW/MED/HIGH) + theme toggle
 */
function Settings({ onBack, isDarkMode, onToggleDarkMode, userId }: SettingsProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [frequency, setFrequency] = useState<FrequencyMode>('high');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Fetch user settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchUserSettings(userId);
        setFrequency((settings.frequency as FrequencyMode) || 'high');
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    loadSettings();
  }, [userId]);

  // Cycle frequency: low -> medium -> high -> low
  const handleFrequencyCycle = async () => {
    const currentIndex = FREQUENCY_ORDER.indexOf(frequency);
    const nextIndex = (currentIndex + 1) % FREQUENCY_ORDER.length;
    const newFrequency = FREQUENCY_ORDER[nextIndex];
    setFrequency(newFrequency);

    try {
      await updateFrequency(userId, newFrequency);
      console.log('Frequency synced:', newFrequency);
    } catch (error) {
      console.error('Failed to update frequency:', error);
      setFrequency(frequency); // revert
    }
  };

  // Handle theme toggle
  const handleThemeToggle = async () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    onToggleDarkMode();

    try {
      await updateTheme(userId, newTheme);
      console.log('Theme synced:', newTheme);
    } catch (error) {
      console.error('Failed to update theme:', error);
      onToggleDarkMode(); // revert
    }
  };

  return (
    <div
      className="h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--background)',
        overscrollBehavior: 'none',
        touchAction: 'pan-y',
      }}
    >
      {/* Header */}
      <Header onSettingsClick={onBack} showBackArrow={true} />

      {/* Settings Content */}
      <motion.div
        ref={scrollAreaRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex-1 px-[24px] pt-[24px] space-y-3 overflow-y-auto"
        style={{
          overscrollBehavior: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {/* Theme Setting */}
        <SettingItem
          isFirstItem={true}
          isLastItem={false}
          settingItemName="Theme"
          customContent={
            <ToggleSwitch isOn={isDarkMode} onToggle={handleThemeToggle} label="Theme" />
          }
        />

        {/* Frequency Setting */}
        <SettingItem
          isFirstItem={false}
          isLastItem={true}
          settingItemName="Insight Frequency"
          customContent={
            <button
              onClick={handleFrequencyCycle}
              className="px-[12px] py-[6px] rounded-full text-[13px] font-semibold transition-all duration-300"
              style={{
                backgroundColor: 'var(--secondary-foreground)',
                color: 'var(--primary-foreground)',
              }}
            >
              {FREQUENCY_LABELS[frequency]}
            </button>
          }
        />

        {/* Version Info */}
        <div className="pt-8 text-center">
          <p className="text-[12px] text-muted-foreground">Mentra Merge v1.0.0</p>
        </div>
      </motion.div>
    </div>
  );
}

export default Settings;
