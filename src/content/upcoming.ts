import type { Phase } from '@/sim/types';

/** Mini-tycoons announced in the App Store but not playable yet (GDD §4). */
export const UPCOMING: { name: string; icon: string; phase: Phase }[] = [
  { name: 'Bee & Breakfast', icon: '🐝', phase: 'garage' },
  { name: 'Garden Gnome Empire', icon: '🧙', phase: 'garage' },
  { name: 'Yard Sale Kingpin', icon: '🏷️', phase: 'garage' },
  { name: 'Cloud Farm', icon: '☁️', phase: 'lancafe' },
  { name: 'Haunted Hotel Inc.', icon: '👻', phase: 'lancafe' },
  { name: 'Pizza Tower Defense', icon: '🍕', phase: 'lancafe' },
  { name: 'Spaghetti Logistics', icon: '🍝', phase: 'lancafe' },
  { name: 'Penguin Ice Cream Co.', icon: '🐧', phase: 'lancafe' },
  { name: 'Dino Daycare', icon: '🦖', phase: 'lancafe' },
  { name: 'Meme Stock Exchange', icon: '📈', phase: 'studio' },
  { name: 'Space Pizza Express', icon: '🚀', phase: 'studio' },
  { name: 'Wizard School Admin', icon: '🧪', phase: 'studio' },
  { name: 'Moon Real Estate', icon: '🌙', phase: 'studio' },
  { name: 'Influencer Farm', icon: '🤳', phase: 'studio' },
  { name: 'Time Travel Tours', icon: '⏳', phase: 'studio' },
  { name: 'Volcano Spa Resort', icon: '🌋', phase: 'tower' },
  { name: 'Kaiju Insurance', icon: '🦕', phase: 'tower' },
  { name: 'Submarine Sushi', icon: '🍣', phase: 'tower' },
  { name: 'Cat Café Galaxy', icon: '🐈', phase: 'tower' },
  { name: 'Robot Uprising HR', icon: '🦾', phase: 'tower' },
  { name: 'Black Hole Recycling', icon: '🕳️', phase: 'tower' },
  { name: 'Parallel Universe Outlet', icon: '🌀', phase: 'tower' },
  { name: 'Tycoon Tycoon', icon: '🏢', phase: 'tower' },
  { name: '???', icon: '❓', phase: 'recursion' },
];

export const PHASE_NAMES: Record<Phase, string> = {
  bedroom: "Mom's Spare Bedroom", garage: 'The Garage', lancafe: 'LAN Café', studio: 'Indie Studio', tower: 'Tycoon Tower', recursion: 'The Recursion',
};
