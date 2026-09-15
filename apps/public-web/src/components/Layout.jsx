import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  OverlayDrawer,
  Select,
} from "@fluentui/react-components";
import {
  Dismiss20Regular,
  Dismiss24Regular,
  Navigation24Regular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, matchPath, useLocation } from "react-router-dom";
import { navRoutes } from "../data/content.js";
import { StatusMessage } from "./StatusMessage.jsx";

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
      width: "42px",
      height: "48px",
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
    minHeight: "44px",
    color: "var(--ink)",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: "1rem",
    fontWeight: 600,
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
    minHeight: "46px",
    paddingRight: "22px",
    paddingLeft: "22px",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: "1rem",
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
  footer: {
    paddingTop: "42px",
    paddingBottom: "42px",
    color: "var(--logo-cream)",
    backgroundColor: "var(--logo-aubergine)",
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    borderTopColor: "var(--line)",
    "@media (max-width: 600px)": { paddingTop: "36px", paddingBottom: "36px" },
  },
  footerGrid: {
    display: "grid",
    gridTemplateColumns: "2fr repeat(3, 1fr)",
    gap: "38px",
    "& > div, & > nav": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "10px",
    },
    "& p": {
      maxWidth: "370px",
      marginTop: "4px",
      marginBottom: 0,
      color: "var(--logo-cream)",
    },
    "& a, & span": {
      color: "rgba(243,238,233,.76)",
      fontSize: ".9rem",
      textDecorationLine: "none",
    },
    "& nav strong": {
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    },
    "@media (max-width: 900px)": {
      gridTemplateColumns: "1fr 1fr",
      gap: "26px",
    },
    "@media (max-width: 600px)": { gridTemplateColumns: "1fr" },
  },
  footerBrand: {
    display: "block",
    width: "170px",
    height: "61px",
    minHeight: "61px",
    flexShrink: 0,
    "@media (max-width: 600px)": {
      width: "160px",
      height: "34px",
      minHeight: "34px",
    },
  },
  footerLogo: {
    display: "block",
    width: "170px",
    height: "61px",
    objectFit: "contain",
    "@media (max-width: 600px)": { display: "none" },
  },
  footerWordmark: {
    display: "none",
    width: "160px",
    height: "34px",
    objectFit: "contain",
    "@media (max-width: 600px)": { display: "block" },
  },
  dialogBody: {
    position: "relative",
    paddingTop: "36px",
    paddingRight: "36px",
    paddingBottom: "36px",
    paddingLeft: "36px",
    backgroundColor: "#fff",
    "& h2": {
      marginTop: 0,
      marginRight: "45px",
      marginBottom: 0,
      fontSize: "2rem",
      lineHeight: 1.1,
    },
    "@media (max-width: 600px)": {
      paddingTop: "26px",
      paddingRight: "22px",
      paddingBottom: "26px",
      paddingLeft: "22px",
    },
  },
  dialogSurface: {
    width: "min(570px, calc(100vw - 28px))",
    maxWidth: "570px",
    maxHeight: "calc(100vh - 32px)",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    overflowY: "auto",
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    borderRadius: "22px",
    boxShadow: "0 30px 90px rgba(36,22,46,.4)",
  },
  dialogTitleContent: {
    display: "grid",
    gap: "8px",
  },
  dialogEyebrow: {
    color: "var(--logo-copper)",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: ".76rem",
    fontWeight: 800,
    letterSpacing: ".15em",
    textTransform: "uppercase",
  },
  dialogContent: {
    display: "grid",
    gap: "17px",
    marginTop: "18px",
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  dialogIntro: {
    marginTop: 0,
    marginBottom: 0,
    color: "var(--muted)",
    fontSize: "1rem",
    lineHeight: 1.55,
  },
  dialogForm: {
    display: "grid",
    gap: "17px",
  },
  dialogField: {
    minWidth: 0,
    "& label": {
      marginBottom: "6px",
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
      fontSize: ".86rem",
      fontWeight: 700,
    },
  },
  dialogControl: {
    width: "100%",
    minHeight: "46px",
    backgroundColor: "#fff",
    borderTopColor: "var(--line)",
    borderRightColor: "var(--line)",
    borderBottomColor: "var(--line)",
    borderLeftColor: "var(--line)",
    borderRadius: "10px",
    ":focus-within": {
      borderTopColor: "var(--logo-teal)",
      borderRightColor: "var(--logo-teal)",
      borderBottomColor: "var(--logo-teal)",
      borderLeftColor: "var(--logo-teal)",
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineColor: "rgba(49,112,108,.2)",
      outlineOffset: "1px",
    },
  },
  dialogSubmit: {
    width: "100%",
    minHeight: "56px",
  },
  dialogClose: {
    position: "absolute",
    top: "20px",
    right: "20px",
    width: "40px",
    minWidth: "40px",
    maxWidth: "40px",
    height: "40px",
    minHeight: "40px",
    maxHeight: "40px",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    color: "var(--logo-aubergine)",
    backgroundColor: "var(--logo-cream)",
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    borderRadius: "50%",
    "::after": {
      display: "none",
    },
    ":hover": {
      color: "var(--logo-aubergine)",
      backgroundColor: "var(--bone)",
    },
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "2px",
      outlineColor: "var(--logo-teal)",
      outlineOffset: "2px",
    },
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
      <Button
        className={styles.language}
        onClick={onToggleLanguage}
      >
        {lang === "en" ? "FR" : "EN"}
      </Button>
      <Button
        appearance="primary"
        className={styles.requestAccess}
        onClick={() => onOpenAccess(accessRole)}
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
          <picture>
            <source media="(max-width: 600px)" srcSet="keyforta-symbol.png" />
            <img
              className={styles.brandImage}
              src="keyforta-logo-primary.png"
              alt="KEYFORTA"
            />
          </picture>
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
            KEYFORTA
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

export function Footer({ lang }) {
  const { t } = useTranslation();
  const styles = useLayoutStyles();
  return (
    <footer className={styles.footer}>
      <div className={mergeClasses("shell", styles.footerGrid)}>
        <div>
          <Link
            className={styles.footerBrand}
            to="/home"
            aria-label={t("a11y.keyforta_home")}
          >
            <img
              className={styles.footerLogo}
              src="keyforta-logo-reversed.png"
              width="1400"
              height="500"
              alt="KEYFORTA"
            />
            <img
              className={styles.footerWordmark}
              src="keyforta-wordmark-reversed.png"
              width="1000"
              height="210"
              alt="KEYFORTA"
            />
          </Link>
          <p>{t("footer_summary")}</p>
        </div>
        <nav aria-label={t("a11y.footer_explore")}>
          <strong>{t("explore")}</strong>
          <Link to="/properties">{t("nav_properties")}</Link>
          <Link to="/how">{t("nav_how")}</Link>
          <Link to="/landlords">{t("nav_landlords")}</Link>
          <Link to="/signin">{t("sign_in")}</Link>
        </nav>
        <nav aria-label={t("a11y.footer_company")}>
          <strong>{t("company")}</strong>
          <Link to="/trust">{t("nav_trust")}</Link>
          <Link to="/faq">{t("faq_short")}</Link>
          <Link to="/contact">{t("contact")}</Link>
        </nav>
        <nav aria-label={t("a11y.footer_legal")}>
          <strong>{t("legal")}</strong>
          <Link to="/privacy">{t("privacy")}</Link>
          <Link to="/terms">{t("terms")}</Link>
          <span>© 2026 KEYFORTA</span>
        </nav>
      </div>
    </footer>
  );
}

export function AccessDialog({ lang, open, interest, onClose, onSubmit }) {
  const { t } = useTranslation();
  const styles = useLayoutStyles();
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) setStatus("");
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface
        className={styles.dialogSurface}
        aria-labelledby="access-title"
        aria-describedby="access-description"
      >
        <DialogBody className={styles.dialogBody}>
          <DialogTitle
            id="access-title"
            action={
              <Button
                appearance="subtle"
                className={styles.dialogClose}
                type="button"
                icon={<Dismiss20Regular />}
                aria-label={t("common.close")}
                onClick={onClose}
              />
            }
          >
            <span className={styles.dialogTitleContent}>
              <span className={styles.dialogEyebrow}>{t("early_access")}</span>
              <span>{t("join_launch")}</span>
            </span>
          </DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <p className={styles.dialogIntro} id="access-description">
              {t("access_intro")}
            </p>
            <form
              id="access-form"
              className={styles.dialogForm}
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(
                  new FormData(event.currentTarget),
                );
                setStatus(onSubmit(values));
                event.currentTarget.reset();
              }}
            >
              <input
                type="hidden"
                name="interest"
                id="access-interest"
                value={interest}
                readOnly
              />
              <Field className={styles.dialogField} label={t("full_name")}>
                <Input className={styles.dialogControl} size="large" name="name" autoComplete="name" required />
              </Field>
              <Field className={styles.dialogField} label={t("email")}>
                <Input
                  className={styles.dialogControl}
                  size="large"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field className={styles.dialogField} label={t("i_am")}>
                <Select
                  key={interest || "access-role"}
                  className={styles.dialogControl}
                  size="large"
                  name="role"
                  defaultValue={interest}
                  required
                >
                  <option value="">{t("select_one")}</option>
                  <option value="tenant">{t("roles.tenant")}</option>
                  <option value="landlord">{t("roles.landlord")}</option>
                  <option value="property_manager">{t("roles.manager")}</option>
                  <option value="maintenance_operator">{t("roles.operator")}</option>
                </Select>
              </Field>
              <Field className={styles.dialogField} label={t("location")}>
                <Input className={styles.dialogControl} size="large" name="location" autoComplete="address-level2" />
              </Field>
              <Button appearance="primary" className={styles.dialogSubmit} size="large" type="submit">
                {t("submit_request")}
              </Button>
              <StatusMessage
                className="form-status show"
                intent="success"
                message={status}
              />
            </form>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
