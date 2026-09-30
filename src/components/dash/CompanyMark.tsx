import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Just enough of a company row to render its mark. */
export type CompanyMarkSource = {
  company_name: string;
  company_logo: string;
};

/**
 * A company's favicon, falling back to its initials.
 *
 * Two fallbacks are stacked on purpose. `company_logo` is empty whenever no
 * website was recorded or the favicon lookup found nothing, and even when it is
 * set the icon can go stale - a company that moves its favicon leaves behind a
 * URL that now 404s. Avatar covers the second case by falling back when the image
 * fails to load, so a dead icon degrades to a monogram rather than a broken-image
 * glyph.
 *
 * Shared rather than repeated per page: this renders on the placement cell's
 * company list, the staff drives board and the student company/drives screen, and
 * the one thing those three must agree on is what a company's identity looks
 * like. Initials come from the name, so the mark is never blank.
 */
export function CompanyMark({
  company,
  className,
}: {
  company: CompanyMarkSource;
  className?: string;
}) {
  return (
    <Avatar className={className ?? "size-10 rounded-md"}>
      {company.company_logo ? <AvatarImage src={company.company_logo} alt="" /> : null}
      <AvatarFallback className="rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">
        {company.company_name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
