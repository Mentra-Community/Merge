import { Settings, ArrowLeft } from 'lucide-react';

interface HeaderProps {
  onSettingsClick: () => void;
  showBackArrow?: boolean;
}

/**
 * Header component with Settings button (right) or Back arrow (left)
 */
function Header({ onSettingsClick, showBackArrow = false }: HeaderProps) {
  return (
    <div className="w-full h-[102px] flex items-center justify-between px-[24px] pt-[30px] relative z-10">
      {/* Left side - Back arrow or spacer */}
      {showBackArrow ? (
        <button
          onClick={onSettingsClick}
          className="w-[40px] h-[40px] rounded-full flex items-center justify-center transition-all duration-300 hover:opacity-80 hover:scale-110"
          style={{ backgroundColor: 'var(--primary-foreground)' }}
        >
          <ArrowLeft className="w-[20px] h-[20px]" style={{ color: 'var(--secondary-foreground)' }} />
        </button>
      ) : (
        <div className="w-[40px] h-[40px]" />
      )}

      {/* Right side - Settings Button or spacer */}
      {showBackArrow ? (
        <div className="w-[40px] h-[40px]" />
      ) : (
        <button
          onClick={onSettingsClick}
          className="w-[40px] h-[40px] rounded-full flex items-center justify-center transition-all duration-300 hover:opacity-80 hover:scale-110"
          style={{ backgroundColor: 'var(--primary-foreground)' }}
        >
          <Settings className="w-[20px] h-[20px]" style={{ color: 'var(--secondary-foreground)' }} />
        </button>
      )}
    </div>
  );
}

export default Header;
