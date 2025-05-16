import React from "react";

interface TopScrollFadeProps {
  /**
   * The height of the fade effect.
   * @default 'h-16' (4rem/64px)
   */
  height?: string;
  /**
   * The color from which the gradient starts (at the top).
   * Should match the background color of the scrollable container.
   * @default 'from-gray-100'
   */
  gradientFromColor?: string;
  /**
   * Optional additional CSS classes to apply to the fade element.
   */
  className?: string;
}

const TopScrollFade: React.FC<TopScrollFadeProps> = ({
  height = "h-4",
  gradientFromColor = "from-gray-100",
  className = "",
}) => {
  return (
    <div
      className={`sticky inset-x-0 top-[-25px] ${height} bg-gradient-to-b ${gradientFromColor} to-transparent pointer-events-none z-10 ${className}`}
      aria-hidden="true" // Decorative element
    />
  );
};

export default TopScrollFade;
