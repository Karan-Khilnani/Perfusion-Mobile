# Perfusion Healthcare Platform - Design Guidelines

## Design Approach
**System-Based Approach**: Healthcare operations platform requiring clarity, trust, and efficiency. Drawing from Material Design principles for information-dense interfaces, with references to professional healthcare platforms like Zocdoc and Practo for established patterns.

**Core Principle**: Functional clarity over visual flair. This is a workflow-driven application prioritizing data visibility and user task completion.

---

## Typography System

**Font Family**: Inter or similar system font via Google Fonts
- **Headings**: Semibold (600), clear hierarchy
  - Page titles: text-2xl to text-3xl
  - Section headers: text-xl
  - Card titles: text-lg
- **Body**: Regular (400) and Medium (500)
  - Primary content: text-base
  - Supporting text: text-sm
  - Metadata/labels: text-xs uppercase tracking-wide
- **Data Display**: Medium (500) for emphasis on numbers, ratings, prices

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8
- Component padding: p-4, p-6
- Section spacing: py-8, py-12
- Card gaps: gap-4, gap-6
- Form field spacing: space-y-4

**Container Widths**:
- Dashboard/Portal pages: max-w-7xl
- Form pages: max-w-2xl centered
- Homepage: max-w-6xl

---

## Component Library

### Homepage (Minimal Design)
- **No hero image** - simple centered layout
- Logo and tagline at top
- Brief mission statement (2-3 lines, text-lg)
- Two prominent portal cards side-by-side (lg:grid-cols-2)
- Each card: Icon, title, description, "Enter Portal" button

### Dashboard Layout
- **Sidebar Navigation** (fixed left, w-64)
  - Logo/branding
  - Main navigation items with icons
  - User profile section at bottom
- **Main Content Area** (ml-64)
  - Page header with title and breadcrumbs
  - Action buttons (top right)
  - Content grid or list view

### Service Listing Cards
**Grid Layout**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-6
**Card Structure**:
- Header: Service name (text-lg font-semibold)
- Key metrics row: Cost • TAT • Rating (inline, text-sm)
- Additional details: 2-3 lines of metadata
- Primary action button at bottom
- Subtle border, rounded-lg, p-6

### Filter & Sort Panel
- **Sidebar filters** (w-64, sticky)
  - Grouped sections with clear labels
  - Checkboxes, range sliders, dropdowns
  - "Apply Filters" button at bottom
- **Sort dropdown** (top of results, aligned right)

### Booking Forms
**Multi-step Layout**:
- Progress indicator at top (step 1 of 3)
- Form fields: Full-width inputs, space-y-4
- Labels above inputs (font-medium, text-sm)
- Required field indicators (*)
- Action buttons: "Back" (secondary) + "Continue" (primary)

### Data Tables (Provider Portal)
- Striped rows for readability
- Fixed header on scroll
- Status badges (pill-shaped, small)
- Action buttons in last column

### Authentication Pages
- Centered card (max-w-md)
- Logo at top
- Form fields with icons
- Social divider line ("or continue with")
- Toggle between Sign Up/Login

---

## Visual Patterns

**Cards**: Consistent elevation with subtle shadow, rounded-lg, hover:shadow-lg transition
**Buttons**: 
- Primary: Solid, font-medium, px-6 py-3
- Secondary: Outline style
- Disabled state: reduced opacity
**Status Indicators**: Badge components with semantic meaning (Booked=blue, Processing=yellow, Complete=green)
**Icons**: Heroicons (outline style), size-5 or size-6
**Input Fields**: border, rounded-md, focus:ring-2, px-4 py-2.5
**Ratings**: Star icons (filled/outline), displayed inline with count

---

## Images

**Homepage**: Optional small illustration/icon above portal cards (not full hero)
**Service Cards**: Small thumbnail images for labs/hospitals (aspect-square, size-16, rounded)
**Provider Profiles**: Circular avatar images (size-12 for listings, size-20 for detail view)

**No large hero images** - this is a functional portal, not marketing site

---

## Page-Specific Layouts

**Search Results**: List view default with toggle to grid
**Booking Confirmation**: Receipt-style layout, centered card with details table
**Order Tracking**: Timeline component showing status progression (vertical line with checkpoints)
**Provider Dashboard**: Widget grid showing stats (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)

---

## Critical UX Patterns

- **Breadcrumbs** on all internal pages
- **Loading states** for search/filtering
- **Empty states** with helpful messaging
- **Confirmation modals** before critical actions
- **Toast notifications** for success/error feedback
- **Consistent back navigation** throughout booking flows