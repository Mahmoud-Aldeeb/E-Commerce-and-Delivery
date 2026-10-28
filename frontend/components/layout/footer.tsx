import Link from "next/link";
import Logo from "@/components/layout/logo";
import { footerData } from "@/config/site";

const footerLink = "text-sm text-ink-soft transition-colors hover:text-ink";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="container-page py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-soft">
              {footerData.brand.description}
            </p>
            <div className="mt-4 flex gap-2">
              {footerData.brand.socials.map((social) => (
                <a
                  key={social.label}
                  href={social.link}
                  aria-label={social.label}
                  className="flex size-9 items-center justify-center rounded-control bg-canvas text-ink-soft transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  <social.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link sections */}
          {footerData.sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-4 text-sm font-semibold text-ink">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={footerLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-ink">Contact us</h3>
            <ul className="space-y-3">
              {footerData.contact.map((item) => (
                <li key={item.text} className="flex gap-3 text-sm text-ink-soft">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-ink-muted">{footerData.bottom.copyright}</p>
          <div className="flex gap-4">
            {footerData.bottom.links.map((link) => (
              <a key={link.label} href={link.href} className="text-xs text-ink-muted hover:text-ink">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}