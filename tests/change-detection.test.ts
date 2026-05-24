import { detectTicketChanges } from "@/services/change-detection";

describe("detectTicketChanges", () => {
  it("generates readable events when tracked fields change", () => {
    const changes = detectTicketChanges(
      {
        system: "JIRA",
        status: "IN PROGRESS",
        priority: "HIGH",
        assignee: "Alice",
        resolution: null,
        commentsHash: "old"
      },
      {
        externalId: "JIRA-1",
        system: "JIRA",
        status: "FIX IN REVIEW",
        priority: "HIGH",
        assignee: "Bob",
        resolution: null,
        commentsHash: "new",
        payload: {},
        normalized: {}
      }
    );

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changedField: "status",
          message: "Jira issue moved from IN PROGRESS to FIX IN REVIEW"
        }),
        expect.objectContaining({
          changedField: "assignee",
          message: "Jira owner changed from Alice to Bob"
        }),
        expect.objectContaining({
          changedField: "commentsHash",
          message: "Jira has new comments"
        })
      ])
    );
  });
});
