/**
 * Copyright (c) Streamlit Inc. (2018-2022) Snowflake Inc. (2022-2025)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, {
  MouseEvent,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import groupBy from "lodash/groupBy"
import { getLogger } from "loglevel"

import { useAppContext } from "@streamlit/app/src/components/StreamlitContextProvider"
import { StreamlitEndpoints } from "@streamlit/connection"
import { isMobile } from "@streamlit/lib"
import { IAppPage } from "@streamlit/protobuf"
import { localStorageAvailable } from "@streamlit/utils"

import NavSection from "./NavSection"
import SidebarNavLink from "./SidebarNavLink"
import {
  StyledSidebarNavContainer,
  StyledSidebarNavItems,
  StyledSidebarNavLinkListItem,
  StyledSidebarNavSeparator,
  StyledViewButton,
} from "./styled-components"

export interface Props {
  endpoints: StreamlitEndpoints
  appPages: IAppPage[]
  collapseSidebar: () => void
  hasSidebarElements: boolean
  onPageChange: (pageName: string) => void
  navSections: string[]
  currentPageScriptHash: string
  expandSidebarNav: boolean
}

// We make the sidebar nav collapsible when there are more than 12 pages.
const COLLAPSE_THRESHOLD = 12
// However, we show the first 10 pages when the sidebar is collapsed.
const NUM_PAGES_TO_SHOW_WHEN_COLLAPSED = 10

const LOG = getLogger("SidebarNav")

interface NavLinkProps {
  pageUrl: string
  page: IAppPage
  isActive: boolean
  onClick: (e: MouseEvent) => void
}

function NavLink({
  pageUrl,
  page,
  isActive,
  onClick,
}: NavLinkProps): ReactElement {
  const pageName = page.pageName as string

  return (
    <StyledSidebarNavLinkListItem>
      <SidebarNavLink
        isActive={isActive}
        pageUrl={pageUrl}
        icon={page.icon}
        onClick={onClick}
      >
        {pageName}
      </SidebarNavLink>
    </StyledSidebarNavLinkListItem>
  )
}

function generateNavSections(
  navSections: string[],
  appPages: IAppPage[],
  needsCollapse: boolean,
  generateNavLink: (page: IAppPage, index: number) => ReactElement,
  expandedSections: Record<string, boolean>,
  toggleSection: (section: string) => void
): ReactNode[] {
  const contents: ReactNode[] = []
  const pagesBySectionHeader = groupBy(
    appPages,
    page => page.sectionHeader || ""
  )
  let currentPageCount = 0
  navSections.forEach(header => {
    // Create a shallow copy to prevent mutations below from affecting
    // the original array.
    const sectionPages = [...(pagesBySectionHeader[header] ?? [])]
    let viewablePages = sectionPages
    const isExpanded = expandedSections[header]

    if (needsCollapse) {
      const availableSlots =
        NUM_PAGES_TO_SHOW_WHEN_COLLAPSED - currentPageCount
      if (availableSlots <= 0) {
        viewablePages = []
      } else if (sectionPages.length > availableSlots) {
        // We can partially show the section
        viewablePages = sectionPages.slice(0, availableSlots)
      }
    }

    if (isExpanded) {
      currentPageCount += viewablePages.length
    }

    if (viewablePages.length > 0) {
      contents.push(
        <NavSection
          key={header}
          header={header}
          isExpanded={isExpanded}
          onToggle={() => toggleSection(header)}
        >
          {viewablePages.map(generateNavLink)}
        </NavSection>
      )
    }
  })

  return contents
}

/** Displays a list of navigable app page links for multi-page apps. */
const SidebarNav = ({
  endpoints,
  appPages,
  collapseSidebar,
  hasSidebarElements,
  onPageChange,
  navSections,
  currentPageScriptHash,
  expandSidebarNav,
}: Props): ReactElement | null => {
  const [expanded, setExpanded] = useState(false)
  const { pageLinkBaseUrl } = useAppContext()

  const localStorageKey = `stSidebarSectionsState-${pageLinkBaseUrl}`
  const [expandedSections, setExpandedSections] = useState<Record<
    string,
    boolean
  > | null>(null)

  const pagesBySectionHeader = useMemo(
    () => groupBy(appPages, page => page.sectionHeader || ""),
    [appPages]
  )

  const numVisiblePages = useMemo(() => {
    if (navSections.length === 0) {
      return appPages.length
    }

    // Only count pages in expanded sections
    return navSections.reduce((count, sectionName) => {
      if (expandedSections && expandedSections[sectionName]) {
        return count + (pagesBySectionHeader[sectionName]?.length || 0)
      }
      return count
    }, 0)
  }, [appPages.length, navSections, expandedSections, pagesBySectionHeader])

  useEffect(() => {
    const cachedSidebarNavExpanded =
      localStorageAvailable() &&
      window.localStorage.getItem("sidebarNavState") === "expanded"

    if (!expanded && (expandSidebarNav || cachedSidebarNavExpanded)) {
      setExpanded(true)
    }
  }, [expanded, expandSidebarNav])

  // Loading the state of sections (expanded/collapsed) from localStorage:
  useEffect(() => {
    if (localStorageAvailable()) {
      const storedState = window.localStorage.getItem(localStorageKey)
      let initialState: Record<string, boolean> = {}
      if (storedState) {
        try {
          initialState = JSON.parse(storedState)
        } catch (e) {
          // The stored state is invalid, so we'll just use the default.
          initialState = {}
          LOG.warn("Could not parse sidebar nav state from localStorage", e)
        }
      }

      const allSections = navSections.reduce(
        (acc, sectionName) => {
          // Default to expanded
          acc[sectionName] = initialState[sectionName] ?? true
          return acc
        },
        {} as Record<string, boolean>
      )
      setExpandedSections(allSections)
    } else {
      // If localStorage is not available, default to all expanded.
      const allSections = navSections.reduce(
        (acc, sectionName) => {
          acc[sectionName] = true
          return acc
        },
        {} as Record<string, boolean>
      )
      setExpandedSections(allSections)
    }
  }, [navSections, localStorageKey])

  // Store the current expanded sections state in localStorage:
  useEffect(() => {
    if (localStorageAvailable() && expandedSections) {
      window.localStorage.setItem(
        localStorageKey,
        JSON.stringify(expandedSections)
      )
    }
  }, [expandedSections, localStorageKey])

  const toggleSection = useCallback((sectionName: string) => {
    setExpandedSections(prev => {
      if (!prev) {
        return null
      }
      return {
        ...prev,
        [sectionName]: !prev[sectionName],
      }
    })
  }, [])

  const handleViewButtonClick = useCallback(() => {
    const nextState = !expanded
    if (localStorageAvailable()) {
      if (nextState) {
        window.localStorage.setItem("sidebarNavState", "expanded")
      } else {
        window.localStorage.removeItem("sidebarNavState")
      }
    }
    setExpanded(nextState)
  }, [expanded])

  const generateNavLink = useCallback(
    (page: IAppPage, index: number) => {
      const pageUrl = endpoints.buildAppPageURL(pageLinkBaseUrl, page)
      const isActive = page.pageScriptHash === currentPageScriptHash

      return (
        <NavLink
          key={`${page.pageName}-${index}`}
          pageUrl={pageUrl}
          page={page}
          isActive={isActive}
          onClick={e => {
            e.preventDefault()
            onPageChange(page.pageScriptHash as string)
            if (isMobile()) {
              collapseSidebar()
            }
          }}
        />
      )
    },
    [
      collapseSidebar,
      currentPageScriptHash,
      endpoints,
      onPageChange,
      pageLinkBaseUrl,
    ]
  )

  if (!expandedSections) {
    // Return null while waiting for the expanded sections state to be initialized
    // to avoid a flicker on the first render.
    return null
  }

  let contents: ReactNode[] = []
  const shouldShowViewButton =
    hasSidebarElements &&
    numVisiblePages > COLLAPSE_THRESHOLD &&
    !expandSidebarNav
  const needsCollapse = shouldShowViewButton && !expanded
  if (navSections.length > 0) {
    // For MPAv2 with headers: renders a NavSection for each header with its respective pages
    contents = generateNavSections(
      navSections,
      appPages,
      needsCollapse,
      generateNavLink,
      expandedSections,
      toggleSection
    )
  } else {
    const viewablePages = needsCollapse
      ? appPages.slice(0, NUM_PAGES_TO_SHOW_WHEN_COLLAPSED)
      : appPages
    // For MPAv1 / MPAv2 with no section headers, single NavSection with all pages
    contents = viewablePages.map(generateNavLink)
  }

  return (
    <StyledSidebarNavContainer data-testid="stSidebarNav">
      <StyledSidebarNavItems data-testid="stSidebarNavItems">
        {contents}
      </StyledSidebarNavItems>
      {shouldShowViewButton && (
        <StyledViewButton
          onClick={handleViewButtonClick}
          data-testid="stSidebarNavViewButton"
        >
          {expanded
            ? "View less"
            : `View ${
                numVisiblePages - NUM_PAGES_TO_SHOW_WHEN_COLLAPSED
              } more`}
        </StyledViewButton>
      )}
      {hasSidebarElements && (
        <StyledSidebarNavSeparator data-testid="stSidebarNavSeparator" />
      )}
    </StyledSidebarNavContainer>
  )
}

export default SidebarNav
