"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { MotionConfig, motion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { SELECTION_SPRING } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TabsValueContext = React.createContext<{
  active: string | undefined
  layoutId: string
  /** False during hydration, true from the first client render after it. */
  hydrated: boolean
} | null>(null)

const subscribeToNothing = () => () => {}

const TabsListContext = React.createContext<{
  variant: "default" | "line"
  indicatorClassName?: string
} | null>(null)

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const active = value ?? uncontrolled
  const layoutId = React.useId()
  const handleValueChange = (next: string) => {
    setUncontrolled(next)
    onValueChange?.(next)
  }
  // Radix must stay in one mode for its lifetime (it warns on a switch):
  // controlled by `value`, controlled by the mirror when a `defaultValue` was
  // given, and left to Radix when neither prop is set.
  const rootValue = value ?? (defaultValue !== undefined ? uncontrolled : undefined)
  // A deep link such as /models/x#materials hydrates on the server's default
  // tab and is corrected in the first client render. The shared-layout pill
  // only gets its layoutId once that correction has happened, so the first
  // paint never slides on its own — motion here follows a user action only.
  const hydrated = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
  const valueContext = React.useMemo(
    () => ({ active, layoutId, hydrated }),
    [active, layoutId, hydrated]
  )

  return (
    // The reduced-motion policy lives with the only motion consumer, so a page
    // without a Tabs never loads the motion runtime.
    <MotionConfig reducedMotion="user">
      <TabsValueContext.Provider value={valueContext}>
        <TabsPrimitive.Root
          data-slot="tabs"
          data-orientation={orientation}
          orientation={orientation}
          {...(rootValue !== undefined ? { value: rootValue } : {})}
          onValueChange={handleValueChange}
          className={cn(
            "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
            className
          )}
          {...props}
        />
      </TabsValueContext.Provider>
    </MotionConfig>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants> & {
    /** Classes for the sliding selection pill behind the active trigger. */
    indicatorClassName?: string
  }) {
  const listContext = React.useMemo(
    () => ({ variant: variant ?? "default", indicatorClassName }),
    [variant, indicatorClassName]
  )
  return (
    <TabsListContext.Provider value={listContext}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  )
}

// The active look the trigger itself used to carry (light: raised white;
// dark: input-tinted chip with an input border), now painted by the pill.
const INDICATOR_CLASS =
  "pointer-events-none absolute inset-0 -z-10 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30"

function TabsIndicator({
  layoutId,
  className,
}: {
  /** Absent before hydration completes, so the first paint cannot animate. */
  layoutId: string | undefined
  className?: string
}) {
  // A DOM without ResizeObserver (a test DOM) cannot measure a layout
  // animation; the server can, so only a browser-like window lacking it falls
  // back to the plain pill. Both server and client otherwise render the same tree.
  if (
    layoutId === undefined ||
    (typeof window !== "undefined" && typeof ResizeObserver === "undefined")
  ) {
    return (
      <span
        aria-hidden="true"
        data-slot="tabs-indicator"
        className={cn(INDICATOR_CLASS, className)}
      />
    )
  }
  return (
    // Pattern: Kokonut UI "smooth-tab" (kokonutui.com) — sliding selection, rebuilt on Radix + shadcn tokens.
    <motion.span
      aria-hidden="true"
      data-slot="tabs-indicator"
      layoutId={layoutId}
      initial={false}
      transition={SELECTION_SPRING}
      className={cn(INDICATOR_CLASS, className)}
    />
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const valueCtx = React.useContext(TabsValueContext)
  const listCtx = React.useContext(TabsListContext)
  const isActive = valueCtx !== null && valueCtx.active === props.value
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative isolate inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:text-foreground dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    >
      {children}
      {isActive && listCtx?.variant !== "line" ? (
        // The key swaps the pre-hydration pill for a fresh shared-layout one,
        // because a layoutId registers only at mount.
        <TabsIndicator
          key={valueCtx.hydrated ? "shared" : "static"}
          layoutId={valueCtx.hydrated ? valueCtx.layoutId : undefined}
          className={listCtx?.indicatorClassName}
        />
      ) : null}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
