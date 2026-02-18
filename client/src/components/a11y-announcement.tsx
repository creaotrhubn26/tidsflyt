import { useEffect } from 'react';

interface A11yAnnouncementProps {
  message: string;
  politeness?: 'polite' | 'assertive';
}

export function A11yAnnouncement({ message, politeness = 'polite' }: A11yAnnouncementProps) {
  useEffect(() => {
    if (message) {
      const announcement = document.getElementById('a11y-announcer');
      if (announcement) {
        announcement.textContent = message;
      }
    }
  }, [message]);

  return (
    <div
      id="a11y-announcer"
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    />
  );
}

// Screen reader only utility class
// Add to your tailwind config or CSS:
// .sr-only {
//   position: absolute;
//   width: 1px;
//   height: 1px;
//   padding: 0;
//   margin: -1px;
//   overflow: hidden;
//   clip: rect(0, 0, 0, 0);
//   white-space: nowrap;
//   border-width: 0;
// }
