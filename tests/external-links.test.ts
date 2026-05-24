import {
  buildExternalLinks,
  normalizeBugId,
  normalizeJiraId,
  normalizeSupportTicketId
} from "@/lib/external-links";

describe("external Oracle links", () => {
  it("normalizes pasted SSO-protected ticket URLs", () => {
    expect(
      normalizeSupportTicketId(
        "https://support.oracle.com/support/?SR=4-0002701146&page=sptemplate&sptemplate=sr-activities"
      )
    ).toBe("4-0002701146");
    expect(normalizeJiraId("https://jira.oraclecorp.com/jira/browse/OFCL-35376")).toBe("OFCL-35376");
    expect(normalizeBugId("https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?rptno=39342735")).toBe(
      "39342735"
    );
  });

  it("builds the expected enterprise deep links", () => {
    const links = buildExternalLinks({
      supportTicketId: "4-0002701146",
      jiraId: "OFCL-35376",
      bugId: "39342735"
    });

    expect(links.supportOracle?.ticketUrl).toBe(
      "https://support.oracle.com/support/?SR=4-0002701146&page=sptemplate&sptemplate=sr-activities"
    );
    expect(links.jira?.ticketUrl).toBe("https://jira.oraclecorp.com/jira/browse/OFCL-35376");
    expect(links.bugOracle?.ticketUrl).toBe(
      "https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?rptno=39342735"
    );
  });
});
