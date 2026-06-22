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

  it("normalizes Oracle links with alternate parameter casing", () => {
    expect(
      normalizeSupportTicketId(
        "https://support.oracle.com/support/?sr=4-0002701146&page=sptemplate&sptemplate=sr-activities"
      )
    ).toBe("4-0002701146");
    expect(normalizeBugId("https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?RPTNO=39342735")).toBe(
      "39342735"
    );
  });

  it("builds the expected enterprise deep links", () => {
    const links = buildExternalLinks({
      supportTicketId: "4-0002701146",
      jiraId: "OFCL-35376",
      bugId: "39342735"
    });

    expect(links.supportOracle?.ticketUrl).toBe("https://support.oracle.com/epmos/faces/SrDetail?srNumber=4-0002701146");
    expect(links.jira?.ticketUrl).toBe("https://jira.oraclecorp.com/jira/browse/OFCL-35376");
    expect(links.bugOracle?.ticketUrl).toBe(
      "https://bug.oraclecorp.com/ords/bug/bugui/bugdetails?bugno=39342735"
    );
  });

  it("preserves exact Oracle URLs pasted during ticket creation", () => {
    const supportUrl = "https://support.oracle.com/support/?page=sptemplate&sptemplate=sr-activities&SR=4-0002701146";
    const bugUrl = "https://bug.oraclecorp.com/ords/bug/bugui/bugdetails?bugno=39342735";
    const links = buildExternalLinks({
      supportTicketId: supportUrl,
      bugId: bugUrl
    });

    expect(links.supportOracle?.ticketUrl).toBe(supportUrl);
    expect(links.bugOracle?.ticketUrl).toBe(bugUrl);
  });
});
