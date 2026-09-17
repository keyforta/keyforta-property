import {
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  makeStyles,
  mergeClasses,
  OverlayDrawer,
  Tooltip,
} from "@fluentui/react-components";
import {
  Dismiss24Regular,
  Navigation24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Link, NavLink, matchPath, useLocation } from "react-router-dom";
import { navRoutes } from "../data/content.js";

const useLayoutStyles = makeStyles({
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    color: "var(--ink)",
    backgroundColor: "rgba(243,238,233,.96)",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderBottomColor: "rgba(43,26,48,.14)",
    boxShadow: "0 1px 0 rgba(43,26,48,.08)",
    backdropFilter: "blur(14px)",
  },
  workspaceHeader: {
    backgroundColor: "var(--logo-aubergine)",
    borderBottomColor: "rgba(255,255,255,.16)",
  },
  navWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    height: "82px",
    "@media (max-width: 600px)": { height: "74px" },
  },
  brand: {
    display: "flex",
    alignItems: "center",
  },
  brandImage: {
    display: "block",
    width: "190px",
    maxHeight: "58px",
    objectFit: "contain",
    "@media (max-width: 1200px)": { width: "178px" },
    "@media (max-width: 600px)": {
      width: "156px",
      height: "auto",
      maxHeight: "48px",
    },
  },
  desktopNav: {
    display: "flex",
    alignItems: "center",
    gap: "24px",
    "& a": {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "44px",
      color: "var(--ink)",
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
      fontWeight: 600,
      textDecorationLine: "none",
    },
    "& a:hover": { color: "var(--logo-teal)" },
    "& a.active": {
      color: "var(--logo-teal)",
      textDecorationLine: "underline",
      textDecorationThickness: "2px",
      textUnderlineOffset: "5px",
    },
    "& a:focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "rgba(49,112,108,.42)",
      outlineOffset: "3px",
    },
    "@media (max-width: 1200px)": { display: "none" },
  },
  workspaceNav: {
    "& a": { color: "var(--logo-cream)" },
    "& a:hover": { color: "var(--logo-copper)" },
    "& a.active": { color: "var(--logo-copper)" },
  },
  menuButton: {
    display: "none",
    placeItems: "center",
    width: "44px",
    minWidth: "44px",
    height: "44px",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    color: "#fff",
    backgroundColor: "var(--logo-aubergine)",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopColor: "var(--logo-aubergine)",
    borderRightColor: "var(--logo-aubergine)",
    borderBottomColor: "var(--logo-aubergine)",
    borderLeftColor: "var(--logo-aubergine)",
    borderRadius: "10px",
    ":hover": {
      color: "#fff",
      backgroundColor: "var(--aubergine)",
      borderTopColor: "var(--aubergine)",
      borderRightColor: "var(--aubergine)",
      borderBottomColor: "var(--aubergine)",
      borderLeftColor: "var(--aubergine)",
    },
    ":active": {
      color: "#fff",
      backgroundColor: "var(--logo-aubergine)",
    },
    "@media (max-width: 1200px)": { display: "grid" },
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "var(--logo-teal)",
      outlineOffset: "3px",
    },
  },
  workspaceMenuButton: {
    color: "var(--ink)",
    backgroundColor: "var(--logo-copper)",
    borderTopColor: "var(--logo-copper)",
    borderRightColor: "var(--logo-copper)",
    borderBottomColor: "var(--logo-copper)",
    borderLeftColor: "var(--logo-copper)",
    ":hover": {
      color: "var(--ink)",
      backgroundColor: "var(--copper)",
      borderTopColor: "var(--copper)",
      borderRightColor: "var(--copper)",
      borderBottomColor: "var(--copper)",
      borderLeftColor: "var(--copper)",
    },
  },
  language: {
    display: "inline-flex",
    alignItems: "center",
    width: "52px",
    minWidth: "52px",
    minHeight: "44px",
    paddingRight: 0,
    paddingLeft: 0,
    color: "var(--ink)",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: "1.35rem",
    fontWeight: 600,
    lineHeight: 1,
    backgroundColor: "transparent",
    borderTopColor: "var(--line)",
    borderRightColor: "var(--line)",
    borderBottomColor: "var(--line)",
    borderLeftColor: "var(--line)",
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "rgba(49,112,108,.42)",
      outlineOffset: "3px",
    },
  },
  requestAccess: {
    minHeight: "44px",
    paddingRight: "12px",
    paddingLeft: "12px",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: "0.9rem",
    fontWeight: 700,
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "rgba(49,112,108,.42)",
      outlineOffset: "3px",
    },
  },
  workspaceControl: { color: "var(--logo-cream)" },
  workspaceContext: {
    marginRight: "4px",
    color: "var(--logo-cream)",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontWeight: 800,
  },
  signOut: {
    minHeight: "42px",
    color: "var(--logo-cream)",
    fontWeight: 700,
    backgroundColor: "transparent",
    borderTopColor: "rgba(255,255,255,.55)",
    borderRightColor: "rgba(255,255,255,.55)",
    borderBottomColor: "rgba(255,255,255,.55)",
    borderLeftColor: "rgba(255,255,255,.55)",
    ":hover": { backgroundColor: "rgba(255,255,255,.12)" },
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "var(--logo-teal)",
      outlineOffset: "3px",
    },
  },
  drawer: { backgroundColor: "var(--parchment)" },
  workspaceDrawer: {
    color: "var(--logo-cream)",
    backgroundColor: "var(--logo-aubergine)",
  },
  drawerLogo: {
    display: "block",
    width: "156px",
    height: "auto",
    maxHeight: "48px",
    objectFit: "contain",
  },
  drawerNav: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    "& a": {
      display: "flex",
      alignItems: "center",
      minHeight: "44px",
      paddingTop: "8px",
      paddingRight: "10px",
      paddingBottom: "8px",
      paddingLeft: "10px",
      color: "var(--ink)",
      fontWeight: 700,
      textDecorationLine: "none",
      borderRadius: "8px",
    },
    "& a.active": { color: "var(--logo-teal)", backgroundColor: "var(--bone)" },
    "& a:focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "rgba(49,112,108,.42)",
      outlineOffset: "3px",
    },
    "& button": { width: "100%", marginTop: "8px" },
  },
  workspaceDrawerNav: {
    "& a": { color: "var(--logo-cream)" },
  },
});

function getNavActive(path, pathname) {
  if (path === "properties") {
    return Boolean(
      matchPath("/properties", pathname) ||
      matchPath("/property/:propertyId", pathname) ||
      matchPath("/apply/:propertyId", pathname),
    );
  }
  if (path === "signin") {
    return Boolean(
      matchPath("/signin", pathname) ||
      matchPath("/login/:role", pathname) ||
      matchPath("/signup/:role", pathname) ||
      matchPath("/demo/:role", pathname) ||
      matchPath("/demo/:role/:section", pathname),
    );
  }
  return Boolean(matchPath(`/${path}`, pathname));
}

export function Header({
  lang,
  menuOpen,
  onToggleLanguage,
  onOpenAccess,
  onToggleMenu,
  onCloseMenu,
}) {
  const { t } = useTranslation();
  const styles = useLayoutStyles();
  const location = useLocation();
  const accessRole =
    matchPath("/login/:role", location.pathname)?.params.role ||
    matchPath("/signup/:role", location.pathname)?.params.role ||
    "";
  const requestAccess = () => {
    onCloseMenu();
    onOpenAccess(accessRole);
  };

  const navigationItems = (
    <>
      {navRoutes.map(([path, key]) => (
        <NavLink
          key={path}
          to={`/${path}`}
          data-route={path}
          className={getNavActive(path, location.pathname) ? "active" : ""}
        >
          {t(key, { defaultValue: path })}
        </NavLink>
      ))}
      <Tooltip
        content={t("common.switch_language")}
        relationship="label"
      >
        <Button
          aria-label={t("common.switch_language")}
          className={styles.language}
          onClick={onToggleLanguage}
        >
          <span aria-hidden="true">{lang === "en" ? "🇫🇷" : "🇺🇸"}</span>
        </Button>
      </Tooltip>
      <Button
        appearance="primary"
        className={styles.requestAccess}
        onClick={requestAccess}
      >
        {t("request_access")}
      </Button>
    </>
  );

  return (
    <header className={styles.header}>
      <div className={mergeClasses("shell", styles.navWrap)}>
        <Link
          className={styles.brand}
          to="/home"
          aria-label={t("a11y.keyforta_home")}
          onClick={onCloseMenu}
        >
          <img
            className={styles.brandImage}
            src="/assets/brand/keyforta-logo-primary.png"
            alt="KEYFORTA"
          />
        </Link>
        <Button
          className={styles.menuButton}
          icon={menuOpen ? <Dismiss24Regular /> : <Navigation24Regular />}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={
            menuOpen ? t("a11y.close_navigation") : t("a11y.open_navigation")
          }
          onClick={onToggleMenu}
        />
        <nav
          id="main-nav"
          className={styles.desktopNav}
          aria-label={t("a11y.primary_navigation")}
          onClick={onCloseMenu}
        >
          {navigationItems}
        </nav>
      </div>
      <OverlayDrawer
        className={styles.drawer}
        open={menuOpen}
        position="end"
        onOpenChange={(_, data) => {
          if (!data.open) onCloseMenu();
        }}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                aria-label={t("a11y.close_navigation")}
                onClick={onCloseMenu}
              />
            }
          >
            <img
              className={styles.drawerLogo}
              src="/assets/brand/keyforta-logo-primary.png"
              alt="KEYFORTA"
            />
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <nav
            id="mobile-nav"
            className={styles.drawerNav}
            aria-label={t("a11y.primary_navigation")}
            onClick={onCloseMenu}
          >
            {navigationItems}
          </nav>
        </DrawerBody>
      </OverlayDrawer>
    </header>
  );
}

