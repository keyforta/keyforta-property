import { localizeProperty, money } from "../data/content.js";
import { Badge, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkCircle20Filled } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    color: "var(--ink)",
    backgroundColor: "#fff",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderRightColor: "var(--line)",
    borderBottomColor: "var(--line)",
    borderLeftColor: "var(--line)",
    borderTopStyle: "solid",
    borderTopWidth: "4px",
    borderTopColor: "var(--logo-teal)",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "18px",
    borderBottomRightRadius: "18px",
    borderBottomLeftRadius: "18px",
    textDecorationLine: "none",
    transitionProperty: "transform, box-shadow",
    transitionDuration: "200ms",
    "&:hover img": {
      transform: "scale(1.025)",
    },
    ":focus-visible": {
      outlineColor: "rgba(49,112,108,.42)",
      outlineStyle: "solid",
      outlineWidth: "3px",
      outlineOffset: "3px",
    },
  },
  copper: {
    borderTopColor: "var(--logo-copper)",
    borderTopLeftRadius: "18px",
    borderTopRightRadius: "4px",
  },
  aubergine: {
    borderTopColor: "var(--logo-aubergine)",
    borderTopLeftRadius: "18px",
    borderTopRightRadius: "18px",
    borderBottomRightRadius: "4px",
  },
  image: {
    position: "relative",
    height: "216px",
    overflow: "hidden",
    "@media (max-width: 600px)": {
      height: "210px",
    },
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transitionProperty: "transform",
    transitionDuration: "450ms",
  },
  badge: {
    position: "absolute",
    top: "14px",
    left: "14px",
    paddingTop: "7px",
    paddingRight: "10px",
    paddingBottom: "7px",
    paddingLeft: "10px",
    backgroundColor: "var(--logo-cream)",
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: ".875rem",
    fontWeight: 700,
  },
  body: {
    paddingTop: "22px",
    paddingRight: "22px",
    paddingBottom: "22px",
    paddingLeft: "22px",
  },
  title: {
    marginTop: "8px",
    marginBottom: "5px",
  },
  price: {
    fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
    fontSize: "1.35rem",
    fontWeight: 800,
  },
  priceUnit: {
    color: "var(--muted)",
    fontSize: ".875rem",
    fontWeight: 500,
  },
  meta: {
    color: "var(--muted)",
    fontSize: "1rem",
  },
  verification: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    marginTop: "13px",
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: "var(--success)",
    fontSize: "1rem",
    fontWeight: 700,
  },
  checkmark: {
    display: "inline-grid",
    placeItems: "center",
    width: "20px",
    height: "20px",
    color: "var(--logo-teal)",
    backgroundColor: "rgba(49,112,108,.14)",
    borderRadius: "50%",
  },
});

export function PropertyCard({ lang, item, position = 0 }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const p = localizeProperty(item, lang);
  const variant = position % 3;

  return (
    <Link
      className={mergeClasses(
        styles.root,
        variant === 1 && styles.copper,
        variant === 2 && styles.aubergine,
      )}
      to={`/property/${p.id}`}
    >
      <div className={styles.image}>
        <img
          className={styles.photo}
          src={p.image}
          alt={p.imageAlt}
          loading={position < 3 ? "eager" : "lazy"}
          fetchPriority={position === 0 ? "high" : "auto"}
        />
        <Badge className={styles.badge} appearance="filled" color="subtle">
          {p.available}
        </Badge>
      </div>
      <div className={styles.body}>
        <span className={styles.price}>
          {money(p.price, lang)}{" "}
          <small className={styles.priceUnit}>{t("property.per_month")}</small>
        </span>
        <h3 className={styles.title}>{p.title}</h3>
        <p className={styles.meta}>
          {p.area}, Kinshasa · {t("property.bedroom", { count: p.beds })} ·{" "}
          {t("property.bathroom", { count: p.baths })}
        </p>
        <p className={styles.verification}>
          <span className={styles.checkmark} aria-hidden="true">
            <CheckmarkCircle20Filled />
          </span>
          {p.verified}
        </p>
      </div>
    </Link>
  );
}
