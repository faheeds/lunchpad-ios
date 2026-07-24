/**
 * Tests for the checkout_required race-condition fix in ModifyModal.handleSubmit.
 *
 * Root cause: onClose() was called before WebBrowser.openAuthSessionAsync(),
 * triggering iOS pageSheet dismissal mid-flight so SFSafariViewController
 * refused to present and returned {type:"cancel"} immediately.
 *
 * Fix: onClose() is called only inside browserResult.type === "success".
 * The finally block always resets submitting regardless of outcome.
 */

// ---------------------------------------------------------------------------
// Types mirroring lib/api.ts return shapes
// ---------------------------------------------------------------------------
type ModifyResult =
  | { action: "updated" }
  | { action: "checkout_required"; checkoutUrl: string };

type BrowserResult =
  | { type: "cancel" }
  | { type: "dismiss" }
  | { type: "success"; url: string };

// ---------------------------------------------------------------------------
// Extracted control flow — mirrors handleSubmit exactly (lines 880–924 of
// app/(app)/orders/[orderId].tsx). Kept here so tests stay pure and fast.
// ---------------------------------------------------------------------------
async function runHandleSubmit({
  modifyOrder,
  openAuthSessionAsync,
  invalidateQueries,
  onClose,
  setSubmitting,
  alertFn,
}: {
  modifyOrder: () => Promise<ModifyResult>;
  openAuthSessionAsync: (url: string, redirectUrl: string) => Promise<BrowserResult>;
  invalidateQueries: (opts: { queryKey: string[] }) => Promise<void>;
  onClose: () => void;
  setSubmitting: (v: boolean) => void;
  alertFn: (title: string, message?: string) => void;
}) {
  try {
    setSubmitting(true);
    const result = await modifyOrder();
    if (result.action === "updated") {
      await invalidateQueries({ queryKey: ["orders"] });
      onClose();
      alertFn("Order updated", "Your changes have been saved.");
    } else {
      const browserResult = await openAuthSessionAsync(
        result.checkoutUrl,
        "lunchpad://checkout/success",
      );
      if (browserResult.type === "success") {
        await invalidateQueries({ queryKey: ["orders"] });
        onClose();
        alertFn("Payment received", "Your order has been updated.");
      }
    }
  } catch (err) {
    alertFn(
      "Couldn't update order",
      err instanceof Error ? err.message : "Please try again or contact the restaurant.",
    );
  } finally {
    setSubmitting(false);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeArgs(overrides: Partial<Parameters<typeof runHandleSubmit>[0]> = {}) {
  return {
    modifyOrder: jest.fn<Promise<ModifyResult>, []>(),
    openAuthSessionAsync: jest.fn<Promise<BrowserResult>, [string, string]>(),
    invalidateQueries: jest
      .fn<Promise<void>, [{ queryKey: string[] }]>()
      .mockResolvedValue(undefined),
    onClose: jest.fn(),
    setSubmitting: jest.fn(),
    alertFn: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handleSubmit — updated path (baseline)", () => {
  it("invalidates orders cache, calls onClose, shows alert, resets submitting", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({ action: "updated" }),
    });

    await runHandleSubmit(args);

    expect(args.setSubmitting).toHaveBeenCalledWith(true);
    expect(args.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["orders"] });
    expect(args.onClose).toHaveBeenCalledTimes(1);
    expect(args.alertFn).toHaveBeenCalledWith("Order updated", "Your changes have been saved.");
    expect(args.setSubmitting).toHaveBeenLastCalledWith(false);
    expect(args.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("call order on updated: invalidate → onClose → alert", async () => {
    const callOrder: string[] = [];
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({ action: "updated" }),
      invalidateQueries: jest
        .fn()
        .mockImplementation(async () => {
          callOrder.push("invalidate");
        }),
      onClose: jest.fn().mockImplementation(() => {
        callOrder.push("close");
      }),
      alertFn: jest.fn().mockImplementation(() => {
        callOrder.push("alert");
      }),
    });

    await runHandleSubmit(args);

    expect(callOrder).toEqual(["invalidate", "close", "alert"]);
  });
});

describe("handleSubmit — checkout_required + cancel (the key fix)", () => {
  it("does NOT call onClose when browser returns cancel", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.onClose).not.toHaveBeenCalled();
  });

  it("does NOT invalidate cache when browser returns cancel", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.invalidateQueries).not.toHaveBeenCalled();
  });

  it("resets submitting via finally even when browser returns cancel", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.setSubmitting).toHaveBeenCalledWith(true);
    expect(args.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("shows no alert when browser returns cancel", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.alertFn).not.toHaveBeenCalled();
  });
});

describe("handleSubmit — checkout_required + dismiss", () => {
  it("does NOT call onClose when browser is dismissed", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "dismiss" }),
    });

    await runHandleSubmit(args);

    expect(args.onClose).not.toHaveBeenCalled();
  });

  it("resets submitting via finally when browser is dismissed", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "dismiss" }),
    });

    await runHandleSubmit(args);

    expect(args.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("does NOT invalidate cache when browser is dismissed", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "dismiss" }),
    });

    await runHandleSubmit(args);

    expect(args.invalidateQueries).not.toHaveBeenCalled();
  });
});

describe("handleSubmit — checkout_required + success", () => {
  it("invalidates orders cache on successful payment", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({
        type: "success",
        url: "lunchpad://checkout/success",
      }),
    });

    await runHandleSubmit(args);

    expect(args.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });

  it("calls onClose on successful payment", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({
        type: "success",
        url: "lunchpad://checkout/success",
      }),
    });

    await runHandleSubmit(args);

    expect(args.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows Payment received alert on successful payment", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({
        type: "success",
        url: "lunchpad://checkout/success",
      }),
    });

    await runHandleSubmit(args);

    expect(args.alertFn).toHaveBeenCalledWith(
      "Payment received",
      "Your order has been updated.",
    );
  });

  it("resets submitting via finally on successful payment", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({
        type: "success",
        url: "lunchpad://checkout/success",
      }),
    });

    await runHandleSubmit(args);

    expect(args.setSubmitting).toHaveBeenCalledWith(true);
    expect(args.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("call order on success: invalidate → onClose → alert", async () => {
    const callOrder: string[] = [];
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test123",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({
        type: "success",
        url: "lunchpad://checkout/success",
      }),
      invalidateQueries: jest
        .fn()
        .mockImplementation(async () => {
          callOrder.push("invalidate");
        }),
      onClose: jest.fn().mockImplementation(() => {
        callOrder.push("close");
      }),
      alertFn: jest.fn().mockImplementation(() => {
        callOrder.push("alert");
      }),
    });

    await runHandleSubmit(args);

    expect(callOrder).toEqual(["invalidate", "close", "alert"]);
  });
});

describe("handleSubmit — openAuthSessionAsync receives correct args", () => {
  it("passes checkoutUrl and lunchpad deep-link scheme", async () => {
    const checkoutUrl = "https://checkout.stripe.com/pay/cs_test_abc123";
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl,
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.openAuthSessionAsync).toHaveBeenCalledWith(
      checkoutUrl,
      "lunchpad://checkout/success",
    );
  });

  it("is called exactly once per submit", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({
        action: "checkout_required",
        checkoutUrl: "https://checkout.stripe.com/pay/test",
      }),
      openAuthSessionAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    });

    await runHandleSubmit(args);

    expect(args.openAuthSessionAsync).toHaveBeenCalledTimes(1);
  });

  it("is NOT called on the updated path", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockResolvedValue({ action: "updated" }),
    });

    await runHandleSubmit(args);

    expect(args.openAuthSessionAsync).not.toHaveBeenCalled();
  });
});

describe("handleSubmit — error path", () => {
  it("shows error alert when modifyOrder rejects with Error", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue(new Error("Network failure")),
    });

    await runHandleSubmit(args);

    expect(args.alertFn).toHaveBeenCalledWith(
      "Couldn't update order",
      "Network failure",
    );
  });

  it("does NOT call onClose on error", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue(new Error("Server error")),
    });

    await runHandleSubmit(args);

    expect(args.onClose).not.toHaveBeenCalled();
  });

  it("does NOT invalidate cache on error", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue(new Error("Server error")),
    });

    await runHandleSubmit(args);

    expect(args.invalidateQueries).not.toHaveBeenCalled();
  });

  it("resets submitting via finally even on error", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue(new Error("Server error")),
    });

    await runHandleSubmit(args);

    expect(args.setSubmitting).toHaveBeenCalledWith(true);
    expect(args.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("uses fallback message for non-Error throws", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue("plain string error"),
    });

    await runHandleSubmit(args);

    expect(args.alertFn).toHaveBeenCalledWith(
      "Couldn't update order",
      "Please try again or contact the restaurant.",
    );
  });

  it("openAuthSessionAsync is never called when modifyOrder throws", async () => {
    const args = makeArgs({
      modifyOrder: jest.fn().mockRejectedValue(new Error("Server error")),
    });

    await runHandleSubmit(args);

    expect(args.openAuthSessionAsync).not.toHaveBeenCalled();
  });
});
