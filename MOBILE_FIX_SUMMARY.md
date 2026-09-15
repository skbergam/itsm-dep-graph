# Mobile Layout Fix - /releases Route

## Problem
On iPhone and narrow viewports (~390px), the release progress page had horizontal overflow:
- "Select Release" and "Drift Comparison" controls sat side-by-side
- "Week-over-Week" button clipped off the right edge of the card
- Users had to scroll horizontally to see all controls

## Solution
Made the layout responsive using Tailwind breakpoints to stack elements vertically on mobile.

## Changes Made

### 1. Controls Grid
**Before:**
```tsx
<div className="grid grid-cols-2 gap-6">
```

**After:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
```
- Stacks vertically on mobile (< 768px)
- Side-by-side from md+ (768px and up)

### 2. Drift Toggle Buttons
**Before:**
```tsx
<div className="flex gap-2">
  <button className="px-4 py-2 ...">Off</button>
  <button className="px-4 py-2 ...">Day-over-Day</button>
  <button className="px-4 py-2 ...">Week-over-Week</button>
</div>
```

**After:**
```tsx
<div className="flex flex-wrap gap-2">
  <button className="flex-1 sm:flex-none px-4 py-2 ... whitespace-nowrap">Off</button>
  <button className="flex-1 sm:flex-none px-4 py-2 ... whitespace-nowrap">Day-over-Day</button>
  <button className="flex-1 sm:flex-none px-4 py-2 ... whitespace-nowrap">Week-over-Week</button>
</div>
```
- `flex-wrap` allows wrapping if needed
- `flex-1` makes buttons equal width on mobile
- `sm:flex-none` returns to auto width on larger screens
- `whitespace-nowrap` prevents text from wrapping inside buttons

### 3. Responsive Padding
- Outer container: `p-8` → `p-4 sm:p-8`
- Control cards: `p-6` → `p-4 sm:p-6`
- Section rollups: `p-4` → `p-3 sm:p-4`

### 4. Release Rollup
**Before:**
```tsx
<div className="flex gap-8">
  <div>
    <div className="text-2xl font-bold">...</div>
  </div>
</div>
```

**After:**
```tsx
<div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
  <div>
    <div className="text-xl sm:text-2xl font-bold">...</div>
  </div>
</div>
```
- Stacks vertically on mobile
- Horizontal layout on desktop
- Smaller font size on mobile

### 5. Section Rollup
**Before:**
```tsx
<div className="grid grid-cols-3 gap-4 text-sm">
```

**After:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
```
- Stacks vertically on mobile
- Three columns on desktop

### 6. Component Grid
**Before:**
```tsx
<div className="grid grid-cols-3 gap-4">
```

**After:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```
- 1 column on mobile (< 640px)
- 2 columns on tablet (640px - 1024px)
- 3 columns on desktop (1024px+)

### 7. Typography Scaling
- Main heading: `text-3xl` → `text-2xl sm:text-3xl`
- Section headings: `text-xl` → `text-lg sm:text-xl`

## Breakpoints Used

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default (mobile) | < 640px | Single column layouts |
| `sm:` | ≥ 640px | Horizontal layouts for small components |
| `md:` | ≥ 768px | Side-by-side controls |
| `lg:` | ≥ 1024px | Three-column component grid |

## Testing

- ✅ Build passes
- ✅ No horizontal overflow on 390px width (iPhone 12/13 Pro)
- ✅ No horizontal overflow on 360px width (Galaxy S8)
- ✅ Desktop layout preserved and looks good
- ✅ All controls remain functional at all breakpoints

## Result

The `/releases` route is now fully usable on mobile devices without any horizontal scrolling. Desktop layout remains unchanged and visually identical to the original design.

## PR

https://github.com/skbergam/itsm-dep-graph/pull/21
