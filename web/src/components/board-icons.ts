import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Code,
  Dumbbell,
  Heart,
  House,
  LayoutGrid,
  Music,
  ShoppingCart,
  Star,
  Target,
} from 'lucide-react'

export const defaultBoardIcon = 'layout-grid'

export const boardIcons = [
  { value: defaultBoardIcon, label: 'boardIconGrid', Icon: LayoutGrid },
  { value: 'briefcase', label: 'boardIconBriefcase', Icon: Briefcase },
  { value: 'house', label: 'boardIconHouse', Icon: House },
  { value: 'code', label: 'boardIconCode', Icon: Code },
  {
    value: 'shopping-cart',
    label: 'boardIconShoppingCart',
    Icon: ShoppingCart,
  },
  { value: 'music', label: 'boardIconMusic', Icon: Music },
  { value: 'book-open', label: 'boardIconBook', Icon: BookOpen },
  { value: 'heart', label: 'boardIconHeart', Icon: Heart },
  { value: 'dumbbell', label: 'boardIconDumbbell', Icon: Dumbbell },
  { value: 'target', label: 'boardIconTarget', Icon: Target },
  { value: 'calendar-days', label: 'boardIconCalendar', Icon: CalendarDays },
  { value: 'star', label: 'boardIconStar', Icon: Star },
] as const

export function getBoardIcon(value: string) {
  return boardIcons.find((icon) => icon.value === value)?.Icon ?? LayoutGrid
}
