  console.log("APP.JS OWNER CLAIM FLOW v17.0.0 LOADED");
  const API_BASE = window.__API_BASE__ || "http://localhost:5000";


  const USER_KEY = "user";
  const AUTH_TOKEN_KEY = "authToken";
  const DEFAULT_IMAGE =
    "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-size='28'%3ENo Image%3C/text%3E%3C/svg%3E";

  let currentUser = getStoredUser();
  let items = [];
  let claimRequests = [];

  const page = document.body.dataset.page || "";

// ================= GLOBAL API LOADING =================

let activeApiRequests = 0;
let topLoaderTimers = [];

function showTopLoader() {
  activeApiRequests++;

  if (activeApiRequests > 1) return;

  let loader = document.getElementById("topLoader");

  if (!loader) {
    loader = document.createElement("div");
    loader.id = "topLoader";
    document.body.appendChild(loader);
  }

  topLoaderTimers.forEach(clearTimeout);
  topLoaderTimers = [];

  loader.style.width = "15%";

  topLoaderTimers.push(
    setTimeout(() => {
      loader.style.width = "45%";
    }, 120)
  );

  topLoaderTimers.push(
    setTimeout(() => {
      loader.style.width = "75%";
    }, 350)
  );

  topLoaderTimers.push(
    setTimeout(() => {
      loader.style.width = "90%";
    }, 800)
  );
}

function hideTopLoader() {
  activeApiRequests = Math.max(0, activeApiRequests - 1);

  if (activeApiRequests > 0) return;

  const loader = document.getElementById("topLoader");

  if (!loader) return;

  topLoaderTimers.forEach(clearTimeout);
  topLoaderTimers = [];

  loader.style.width = "100%";

  setTimeout(() => {
    loader.style.width = "0%";
  }, 250);
}

function startButtonLoading(button, loadingText = "Please wait...") {
  if (!button || button.dataset.loading === "true") {
    return false;
  }

  button.dataset.loading = "true";
  button.dataset.originalHtml = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `
    <span class="button-spinner"></span>
    <span>${loadingText}</span>
  `;

  return true;
}

function stopButtonLoading(button) {
  if (!button) return;

  const originalHtml = button.dataset.originalHtml;

  if (originalHtml !== undefined) {
    button.innerHTML = originalHtml;
  }

  button.disabled = false;

  delete button.dataset.loading;
  delete button.dataset.originalHtml;
}

  // ================= BASIC HELPERS =================

  function normalizeUser(value) {
    if (!value || typeof value !== "object") return null;

    const user = value.user && typeof value.user === "object"
      ? value.user
      : value;

    if (!user.email || !user.role) return null;

    return user;
  }

  function getStoredUser() {
    try {
      const storedUser =
        sessionStorage.getItem(USER_KEY) ||
        localStorage.getItem(USER_KEY);

      if (!storedUser) return null;

      const normalizedUser = normalizeUser(JSON.parse(storedUser));

      if (normalizedUser) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
        localStorage.removeItem(USER_KEY);
      }

      return normalizedUser;
    } catch {
      return null;
    }
  }

  function saveUser(value) {
    const user = normalizeUser(value);
    if (!user) return false;

    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.removeItem(USER_KEY);
    return true;
  }

  function getToken() {
    return (
      sessionStorage.getItem(AUTH_TOKEN_KEY) ||
      localStorage.getItem(AUTH_TOKEN_KEY)
    );
  }

  function saveToken(token) {
    if (!token) return;

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  async function refreshCurrentUser() {
    const token = getToken();

    if (!token) {
      currentUser = null;
      return null;
    }

    try {
      const response = await apiRequest("/api/users/me");
      const user = normalizeUser(response);

      if (!user) {
        throw new Error("Invalid current-user response");
      }

      currentUser = user;
      saveUser(user);

      console.log("[CURRENT USER SYNCED]", {
        email: user.email,
        role: user.role,
        studentName: user.studentName || user.name || ""
      });

      return user;
    } catch (error) {
      console.error("Current user sync failed:", error);
      return currentUser;
    }
  }

  function logout() {
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);

    items = [];
    claimRequests = [];
    window.location.href = "login.html";
  }

  function go(path) {
    window.location.href = path;
  }

  function setMessage(el, text, color = "green") {
    if (!el) return;
    el.innerText = text;
    el.style.color = color;
  }

  async function apiRequest(path, options = {}, uiOptions = {}) {
  const token = getToken();

  const {
    button = null,
    loadingText = "Please wait..."
  } = uiOptions;

  if (button && button.dataset.loading === "true") {
    throw new Error("request_already_running");
  }

  showTopLoader();

  if (button) {
    startButtonLoading(button, loadingText);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    const text = await res.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      console.log("API ERROR:", {
        path,
        status: res.status,
        response: text
      });

      throw new Error(
        (data && data.message) ||
        (data && data.error) ||
        text ||
        "api_error"
      );
    }

    return data;
  } finally {
    if (button) {
      stopButtonLoading(button);
    }

    hideTopLoader();
  }
}
    function getId(obj) {
      return obj?.id || obj?._id || "";
    }

    function formatDate(value) {
      if (!value) return "-";
      try {
        return new Date(value).toLocaleString();
      } catch {
        return value;
      }
    }

    function requireStudent() {
      if (
        !currentUser ||
        String(currentUser.role || "").trim().toLowerCase() !== "student"
      ) {
        go("login.html");
        return false;
      }
      return true;
    }

    function requireAdmin() {
      if (
        !currentUser ||
        String(currentUser.role || "").trim().toLowerCase() !== "admin"
      ) {
        go("login.html");
        return false;
      }
      return true;
    }

    function isProfileComplete(user) {
      return !!(
        user &&
        user.studentName &&
        user.studentPhone &&
        user.studentBranch &&
        user.studentRollNo
      );
    }

  // ================= LOGIN =================

  function setupLoginPage() {
    if (page !== "login") return;

    const form = document.getElementById("loginForm");
    const msg = document.getElementById("loginMessage");
    const loginButton = document.getElementById("loginButton");

    form.onsubmit = async (e) => {
      e.preventDefault();

      const email = document.getElementById("loginEmail").value.trim().toLowerCase();
      const password = document.getElementById("loginPassword").value.trim();
      
      try {
        const res = await apiRequest(
  "/api/users/login",
  {
    method: "POST",
    body: JSON.stringify({ email, password })
  },
  {
    button: loginButton,
    loadingText: "Logging in..."
  }
);
        

        const user = normalizeUser(res);

        if (!user || !res.token) {
          throw new Error("Invalid login response");
        }

        saveToken(res.token);
        saveUser(user);
        currentUser = user;
        items = [];
        claimRequests = [];

        if (user.role === "admin") {
          go("admin.html");
        } else {
          go("dashboard.html");
        }
      } catch {
        setMessage(msg, "Invalid login", "red");
      }
      
    };
    
  }

  // ================= REGISTER =================

  function setupRegisterPage() {
    if (page !== "register") return;

    const form = document.getElementById("registerForm");
    const msg = document.getElementById("registerMessage");
    const registerButton = document.getElementById("registerButton");

    form.onsubmit = async (e) => {
      e.preventDefault();

      const name = document.getElementById("registerName").value.trim();
      const email = document.getElementById("registerEmail").value.trim().toLowerCase();
      const password = document.getElementById("registerPassword").value.trim();

      try {
await apiRequest(
  "/api/users/register",
  {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  },
  {
    button: registerButton,
    loadingText: "Registering..."
  }
);

        form.reset();
        setMessage(msg, "Registered successfully. Please login.", "green");

        setTimeout(() => {
          go("login.html");
        }, 1000);
      } catch {
        setMessage(msg, "Registration failed or user already exists", "red");
      }
    };
  }

  // ================= PROFILE SETUP =================

  function setupProfilePage() {
    if (page !== "profile-setup") return;
    if (!requireStudent()) return;

    const form = document.getElementById("profileSetupForm");
    const msg = document.getElementById("profileSetupMessage");

    document.getElementById("studentName").value =
      currentUser.studentName || currentUser.name || "";
    document.getElementById("studentPhone").value = currentUser.studentPhone || "";
    document.getElementById("studentBranch").value = currentUser.studentBranch || "";
    document.getElementById("studentRollNo").value = currentUser.studentRollNo || "";

    form.onsubmit = async (e) => {
      e.preventDefault();

      const studentName = document.getElementById("studentName").value.trim();
      const studentPhone = document.getElementById("studentPhone").value.trim();
      const studentBranch = document.getElementById("studentBranch").value.trim();
      const studentRollNo = document.getElementById("studentRollNo").value.trim();

      try {
        const updatedUser = await apiRequest(
          `/api/users/${encodeURIComponent(currentUser.email)}/profile`,
          {
            method: "PUT",
            body: JSON.stringify({
              studentName,
              studentPhone,
              studentBranch,
              studentRollNo
            })
          }
        );

        const savedProfileUser = normalizeUser(updatedUser);

        if (!savedProfileUser) {
          throw new Error("Invalid profile response");
        }

        currentUser = savedProfileUser;
        saveUser(savedProfileUser);

        setMessage(msg, "Profile saved successfully", "green");

        setTimeout(() => {
          go("dashboard.html");
        }, 700);
      } catch {
        setMessage(msg, "Profile save failed", "red");
      }
    };
  }

  // ================= ITEMS =================

  async function loadItems() {
    try {
      items = await apiRequest("/api/items");
    } catch {
      items = [];
    }
  }

  async function loadClaimRequests() {
    try {
      const response = await apiRequest("/api/claims");
      claimRequests = Array.isArray(response)
        ? response
        : Array.isArray(response?.claims)
          ? response.claims
          : [];

      console.log("[ADMIN CLAIMS LOADED]", {
        count: claimRequests.length,
        claims: claimRequests
      });

      return claimRequests;
    } catch (error) {
      console.error("Failed to load claim requests:", error);
      claimRequests = [];

      const container = document.getElementById("claimRequestsContainer");
      if (container) {
        container.innerHTML = `<div class="empty-message">${error.message || "Unable to load claim requests"}</div>`;
      }

      throw error;
    }
  }

  function getApprovalBadge(item) {
    if (item.approvalStatus === "pending") {
      return `<span class="badge pending">Under Review - Wait up to 1 week</span>`;
    }

    if (item.approvalStatus === "rejected") {
      return `<span class="badge rejected">Rejected by Admin</span>`;
    }

    if (item.status === "claimed") {
      return `<span class="badge claimed">Claimed</span>`;
    }

    if (item.approvalStatus === "approved") {
      return `<span class="badge approved">Approved by Admin</span>`;
    }

    return `<span class="badge pending">Pending</span>`;
  }

  function cardHTML(item, type = "browse") {
    const itemId = getId(item);

    return `
      <div class="card">
        <img src="${item.image || DEFAULT_IMAGE}" alt="${item.title || "Item"}" onerror="this.src='${DEFAULT_IMAGE}'">

        <div class="card-body">
          <div class="card-top">
            <div>
              <div class="card-title">${item.title || "-"}</div>
              <small>${item.category || "-"}</small>
            </div>
            ${getApprovalBadge(item)}
          </div>

          <div class="card-info">
            <div><strong>Location:</strong> ${item.location || "-"}</div>
            <div><strong>Date:</strong> ${item.date || "-"}</div>
            <div><strong>Reported By:</strong> ${item.createdBy || "-"}</div>
          </div>

          <div class="card-desc">
            ${(item.description || "").length > 90
              ? item.description.substring(0, 90) + "..."
              : item.description || "-"}
          </div>

          <div class="card-buttons">
            <button class="small-btn view-btn" onclick="viewItem('${itemId}')">
              View Details
            </button>

            ${
              type === "browse" &&
              item.approvalStatus === "approved" &&
              item.status === "active"
                ? `
                  <button
                    type="button"
                    class="small-btn claim-btn"
                    onclick="window.openClaimRequest('${itemId}')"
                  >
                    Claim This Item
                  </button>
                `
                : ""
            }

            ${
              type === "my"
                ? `
                  ${
                    item.approvalStatus === "approved" && item.status === "active"
                      ? `<button
                           type="button"
                           class="small-btn claim-btn"
                           onclick="window.openClaimRequest('${itemId}')"
                         >
                           Claim This Item
                         </button>`
                      : ""
                  }
                  <button class="small-btn delete-btn" onclick="deleteReport('${itemId}')">Delete</button>
                `
                : ""
            }

            ${
              type === "admin"
                ? `
                  ${
                    item.approvalStatus !== "approved"
                      ? `<button class="small-btn approve-btn" onclick="approveReport('${itemId}')">Approve</button>`
                      : ""
                  }

                  ${
                    item.approvalStatus !== "rejected"
                      ? `<button class="small-btn reject-btn" onclick="rejectReport('${itemId}')">Reject</button>`
                      : ""
                  }

                  <button class="small-btn delete-btn" onclick="adminDeleteReport('${itemId}')">
                    Delete
                  </button>
                `
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  // ================= MODAL =================

  window.viewItem = function (id) {
    const item = items.find((i) => String(getId(i)) === String(id));
    if (!item) return;

    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modalContent");

    if (!modal || !modalContent) {
      alert("Claim modal is missing from dashboard.html.");
      console.error("[CLAIM MODAL MISSING]", {
        modalFound: Boolean(modal),
        modalContentFound: Boolean(modalContent)
      });
      return;
    }

    modalContent.innerHTML = `
      <img class="modal-img" src="${item.image || DEFAULT_IMAGE}" alt="${item.title || "Item"}" onerror="this.src='${DEFAULT_IMAGE}'">
      <h2>${item.title || "-"}</h2>
      <p><strong>Approval Status:</strong> ${item.approvalStatus || "-"}</p>
      <p><strong>Status:</strong> ${item.status || "-"}</p>
      <p><strong>Type:</strong> ${item.type || "-"}</p>
      <p><strong>Category:</strong> ${item.category || "-"}</p>
      <p><strong>Location:</strong> ${item.location || "-"}</p>
      <p><strong>Date:</strong> ${item.date || "-"}</p>
      <p><strong>Description:</strong> ${item.description || "-"}</p>
      <p><strong>Contact Name:</strong> ${item.contactName || "-"}</p>
      <p><strong>Contact Phone:</strong> ${item.contactPhone || "-"}</p>
      <p><strong>Contact Email:</strong> ${item.contactEmail || "-"}</p>
    `;

    modal.classList.remove("hidden");
  };

  window.openClaimRequest = function (id) {
    const item = items.find((currentItem) => String(getId(currentItem)) === String(id));

    if (!item) {
      alert("Item not found. Please refresh the page.");
      return;
    }

    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modalContent");

    if (!modal || !modalContent) return;

    modalContent.innerHTML = `
      <form id="secureClaimForm" class="secure-claim-form" novalidate>
        <div>
          <h2>Secure Claim Verification</h2>
          <p class="claim-security-banner">
            🔐 Do not enter public details copied from the report. Provide private
            ownership details that only the real owner is likely to know.
          </p>
        </div>

        <div class="claim-item-summary">
          <img
            src="${item.image || DEFAULT_IMAGE}"
            alt="${item.title || "Claimed item"}"
            onerror="this.src='${DEFAULT_IMAGE}'"
          />
          <div>
            <h3>${item.title || "-"}</h3>
            <p><strong>Category:</strong> ${item.category || "-"}</p>
            <p><strong>Found at:</strong> ${item.location || "-"}</p>
          </div>
        </div>

        <div class="claim-grid">
          <div class="claim-field">
            <label for="claimLostDate">When did you lose it? *</label>
            <input id="claimLostDate" type="date" required />
          </div>

          <div class="claim-field">
            <label for="claimLostLocation">Where did you lose it? *</label>
            <input
              id="claimLostLocation"
              type="text"
              minlength="3"
              maxlength="160"
              placeholder="Building, room, route or nearby landmark"
              required
            />
          </div>

          <div class="claim-field">
            <label for="claimBrand">Brand / Model</label>
            <input
              id="claimBrand"
              type="text"
              maxlength="100"
              placeholder="Example: boAt Airdopes 141"
            />
          </div>

          <div class="claim-field">
            <label for="claimColor">Exact Color</label>
            <input
              id="claimColor"
              type="text"
              maxlength="60"
              placeholder="Example: Matte black with blue case"
            />
          </div>

          <div class="claim-field">
            <label for="claimApproximateValue">Approximate Value (₹)</label>
            <input
              id="claimApproximateValue"
              type="number"
              min="0"
              max="10000000"
              step="1"
              placeholder="Optional"
            />
          </div>

          <div class="claim-field">
            <label for="claimLastUsed">Last used / seen near</label>
            <input
              id="claimLastUsed"
              type="text"
              maxlength="160"
              placeholder="Optional additional location clue"
            />
          </div>

          <div class="claim-field full">
            <label for="claimUniqueMarks">Private identification marks *</label>
            <textarea
              id="claimUniqueMarks"
              minlength="10"
              maxlength="600"
              placeholder="Scratch, sticker, serial-number ending, cover, saved name, contents, damage, engraving..."
              required
            ></textarea>
            <small>Do not reveal full passwords, PINs or complete financial information.</small>
          </div>

          <div class="claim-field full">
            <label for="claimReason">Explain why this item belongs to you *</label>
            <textarea
              id="claimReason"
              minlength="30"
              maxlength="1200"
              placeholder="Explain ownership history and details that can be verified by admin."
              required
            ></textarea>
            <div id="claimReasonCount" class="claim-character-count">0 / 1200</div>
          </div>

          <div class="claim-field full">
            <label for="claimAdditionalInfo">Additional verification information</label>
            <textarea
              id="claimAdditionalInfo"
              maxlength="600"
              placeholder="Purchase month, accessory included, lock-screen detail, document initials, etc."
            ></textarea>
          </div>
        </div>

        <label class="claim-declaration">
          <input id="claimDeclaration" type="checkbox" required />
          <span>
            I confirm that the information is truthful. I understand that false
            claims may be rejected and recorded for campus security review.
          </span>
        </label>

        <p id="claimFormError" class="claim-error" aria-live="polite"></p>

        <button
          id="submitClaimButton"
          type="submit"
          class="btn primary full-btn"
        >
          Submit Secure Claim
        </button>
      </form>
    `;

    modal.classList.remove("hidden");

    const form = document.getElementById("secureClaimForm");
    const reasonInput = document.getElementById("claimReason");
    const reasonCount = document.getElementById("claimReasonCount");

    if (reasonInput && reasonCount) {
      reasonInput.addEventListener("input", () => {
        reasonCount.textContent = `${reasonInput.value.length} / 1200`;
      });
    }

    if (form) {
      form.onsubmit = async (event) => {
        event.preventDefault();

        console.log("[SECURE CLAIM FORM SUBMIT]", {
          itemId: getId(item),
          currentUserEmail: currentUser?.email || null,
          hasToken: Boolean(getToken())
        });

        await window.submitClaimRequest(getId(item));
      };
    }
  };

  window.submitClaimRequest = async function (id) {
    const item = items.find((currentItem) => String(getId(currentItem)) === String(id));
    const errorBox = document.getElementById("claimFormError");
    const submitButton = document.getElementById("submitClaimButton");

    if (!item) {
      const message = "Item not found. Refresh and try again.";
      if (errorBox) errorBox.textContent = message;
      alert(message);
      return;
    }

    const requesterEmail = String(currentUser?.email || "")
      .trim()
      .toLowerCase();

    if (!requesterEmail) {
      console.warn(
        "Stored user email is missing; backend JWT authentication will determine the claimant."
      );
    }


    const payload = {
      itemId: getId(item),
      lostDate: document.getElementById("claimLostDate")?.value || "",
      lostLocation: document.getElementById("claimLostLocation")?.value.trim() || "",
      brand: document.getElementById("claimBrand")?.value.trim() || "",
      color: document.getElementById("claimColor")?.value.trim() || "",
      approximateValue: document.getElementById("claimApproximateValue")?.value || "",
      lastUsedLocation: document.getElementById("claimLastUsed")?.value.trim() || "",
      uniqueMarks: document.getElementById("claimUniqueMarks")?.value.trim() || "",
      reason: document.getElementById("claimReason")?.value.trim() || "",
      additionalInfo: document.getElementById("claimAdditionalInfo")?.value.trim() || "",
      declarationAccepted: Boolean(document.getElementById("claimDeclaration")?.checked)
    };

    if (!payload.lostDate || !payload.lostLocation || !payload.uniqueMarks || !payload.reason) {
      const message = "Please complete every required ownership field.";
      if (errorBox) errorBox.textContent = message;
      alert(message);
      return;
    }

    if (payload.uniqueMarks.length < 10) {
      const message = "Identification marks must contain at least 10 characters.";
      if (errorBox) errorBox.textContent = message;
      alert(message);
      return;
    }

    if (payload.reason.length < 30) {
      const message = "Ownership explanation must contain at least 30 characters.";
      if (errorBox) errorBox.textContent = message;
      alert(message);
      return;
    }

    if (!payload.declarationAccepted) {
      const message = "Please accept the truthful-information declaration.";
      if (errorBox) errorBox.textContent = message;
      alert(message);
      return;
    }

    if (errorBox) errorBox.textContent = "";

    try {
      console.log("[CLAIM SUBMIT]", {
        apiBase: API_BASE,
        requesterEmail: requesterEmail || "(resolved by backend JWT)",
        itemId: payload.itemId,
        hasToken: Boolean(getToken())
      });

      const response = await apiRequest(
        "/api/claims",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        {
          button: submitButton,
          loadingText: "Verifying claim..."
        }
      );

      console.log("[CLAIM CREATED RESPONSE]", response);

      alert(
        response?.message ||
          "Claim submitted successfully. Admin will review your verification details."
      );

      const modal = document.getElementById("modal");
      if (modal) modal.classList.add("hidden");

      await loadItems();

      if (page === "dashboard") {
        renderDashboardItems();
      }

      if (page === "my-reports") {
        renderMyReports();
      }
    } catch (error) {
      console.log(error);

      const claimErrorMessage =
        error?.message || "Failed to submit claim request. Please try again.";

      if (errorBox) {
        errorBox.textContent = claimErrorMessage;
      }

      alert(claimErrorMessage);
    }
  };

  // ================= AI SMART MATCH POPUP =================

  function showAiMatchPopup(aiMatch) {
    const item = aiMatch.item || aiMatch.matchedItem || aiMatch.matchedItemData || {};

    const itemId = getId(item);

    const popup = document.createElement("div");
    popup.className = "ai-match-overlay";

    popup.innerHTML = `
      <div class="ai-match-modal">
        <div class="ai-match-header">🤖 Possible Match Found!</div>

        <p class="ai-match-subtitle">
          This item may belong to you.
        </p>

        <img
          class="ai-match-image"
          src="${item.image || DEFAULT_IMAGE}"
          alt="Matched Item"
          onerror="this.src='${DEFAULT_IMAGE}'"
        >

        <div class="ai-match-details">
          <div><strong>Match Score:</strong> ${aiMatch.score || 0}%</div>
          <div><strong>Location:</strong> ${item.location || "-"}</div>
          <div><strong>Category:</strong> ${item.category || "-"}</div>
          <div><strong>Description:</strong> ${item.description || "-"}</div>
        </div>

        <div class="ai-match-buttons">
          <button id="claimMatchedBtn" class="small-btn claim-btn">
            Claim This Matched Item
          </button>

          <button id="continueAiBtn" class="small-btn view-btn">
            Continue
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    const continueBtn = document.getElementById("continueAiBtn");
    const claimBtn = document.getElementById("claimMatchedBtn");

    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        popup.remove();
        go("thankyou.html");
      });
    }

    if (claimBtn) {
      claimBtn.addEventListener("click", () => {
        popup.remove();

        if (!itemId) {
          alert("Matched item ID missing.");
          return;
        }

        openClaimRequest(itemId);
      });
    }
  }

  function setupModal() {
    const modal = document.getElementById("modal");
    const closeBtn = document.getElementById("closeModal");

    if (modal && closeBtn) {
      closeBtn.onclick = () => modal.classList.add("hidden");

      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
        }
      };
    }
  }

  // ================= DASHBOARD PROFILE =================

  function setupDashboardProfile() {
    if (page !== "dashboard" || !currentUser) return;

    const profileBtn = document.getElementById("profileBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    const profileName = document.getElementById("profileName");
    const profileEmail = document.getElementById("profileEmail");
    const profilePhone = document.getElementById("profilePhone");
    const profileBranch = document.getElementById("profileBranch");
    const profileRoll = document.getElementById("profileRoll");

    if (profileName) {
      profileName.textContent =
        currentUser.studentName || currentUser.name || "Student";
    }

    if (profileEmail) profileEmail.textContent = currentUser.email || "-";
    if (profilePhone) profilePhone.textContent = currentUser.studentPhone || "-";
    if (profileBranch) profileBranch.textContent = currentUser.studentBranch || "-";
    if (profileRoll) profileRoll.textContent = currentUser.studentRollNo || "-";

    if (!profileBtn || !profileDropdown) return;

    if (profileBtn.dataset.profileBound === "true") return;
    profileBtn.dataset.profileBound = "true";

    const closeProfile = () => {
      profileDropdown.classList.add("hidden");
      profileBtn.setAttribute("aria-expanded", "false");
    };

    profileBtn.setAttribute("aria-expanded", "false");

    profileBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const willOpen = profileDropdown.classList.contains("hidden");
      profileDropdown.classList.toggle("hidden");
      profileBtn.setAttribute("aria-expanded", String(willOpen));
    });

    profileDropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", closeProfile);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeProfile();
    });
  }

  // ================= DASHBOARD =================

  async function setupDashboardPage() {
    if (page !== "dashboard") return;
    if (!requireStudent()) return;

    if (!isProfileComplete(currentUser)) {
      go("profile-setup.html");
      return;
    }

    await loadItems();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;

    const form = document.getElementById("itemForm");
    const imageUpload = document.getElementById("imageUpload");
    const imagePreview = document.getElementById("imagePreview");
    const successMessage = document.getElementById("successMessage");

    let selectedImageBase64 = "";

    if (imageUpload) {
      imageUpload.onchange = () => {
        const file = imageUpload.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
          selectedImageBase64 = reader.result;
          imagePreview.src = selectedImageBase64;
          imagePreview.classList.remove("hidden");
        };

        reader.readAsDataURL(file);
      };
    }

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();

        const itemData = {
          title: document.getElementById("title").value.trim(),
          description: document.getElementById("description").value.trim(),
          location: document.getElementById("location").value.trim(),
          date: document.getElementById("date").value,
          type: document.getElementById("type").value,
          category: document.getElementById("category").value,
          contactName: document.getElementById("contactName").value.trim(),
          contactPhone: document.getElementById("contactPhone").value.trim(),
          contactEmail: document.getElementById("contactEmail").value.trim(),
          image: selectedImageBase64 || DEFAULT_IMAGE
        };

        try {
          const createdReport = await apiRequest("/api/items", {
            method: "POST",
            body: JSON.stringify(itemData)
          });

          form.reset();
          selectedImageBase64 = "";

          if (imagePreview) {
            imagePreview.src = "";
            imagePreview.classList.add("hidden");
          }
          console.log("CREATED REPORT RESPONSE:", createdReport);
          console.log("AI MATCH RESPONSE:", createdReport?.aiMatch);

          const aiMatch = createdReport && createdReport.aiMatch;

          if (
            itemData.type === "lost" &&
            aiMatch &&
            aiMatch.matched === true &&
            Number(aiMatch.score) >= 60
          ) {
            await loadItems();
            renderDashboardItems();
            showAiMatchPopup(aiMatch);
          } else {
            go("thankyou.html");
          }
        } catch (error) {
          console.error("Report submit error:", error);
          setMessage(
            successMessage,
            error?.message || "Failed to submit report",
            "red"
          );
        }
      };
    }

    const searchInput = document.getElementById("searchInput");
    const typeFilter = document.getElementById("typeFilter");
    const categoryFilter = document.getElementById("categoryFilter");

    let searchTimeout;

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderDashboardItems, 300);
      });
    }

    if (typeFilter) {
      typeFilter.addEventListener("change", renderDashboardItems);
    }

    if (categoryFilter) {
      categoryFilter.addEventListener("change", renderDashboardItems);
    }

    renderDashboardItems();
  }

  function renderDashboardItems() {
    const container = document.getElementById("itemsContainer");
    const totalCount = document.getElementById("totalCount");
    const lostCount = document.getElementById("lostCount");
    const foundCount = document.getElementById("foundCount");
    const claimedCount = document.getElementById("claimedCount");

    const currentEmail = String(currentUser.email || "").trim().toLowerCase();

    const myApprovedItemsForStats = items.filter(
      (i) =>
        i.approvalStatus === "approved" &&
        String(i.createdBy || "").trim().toLowerCase() === currentEmail
    );

    if (totalCount) totalCount.innerText = myApprovedItemsForStats.length;
    if (lostCount) {
      lostCount.innerText = myApprovedItemsForStats.filter((i) => i.type === "lost").length;
    }
    if (foundCount) {
      foundCount.innerText = myApprovedItemsForStats.filter((i) => i.type === "found").length;
    }
    if (claimedCount) {
      claimedCount.innerText = myApprovedItemsForStats.filter((i) => i.status === "claimed").length;
    }

    if (!container) return;

    const searchValue =
      document.getElementById("searchInput")?.value.toLowerCase().trim() || "";

    const typeValue = document.getElementById("typeFilter")?.value || "all";
    const categoryValue = document.getElementById("categoryFilter")?.value || "All";

    let approvedItems = items.filter(
      (item) =>
        item.approvalStatus === "approved" &&
        item.status === "active" &&
        String(item.createdBy || "")
          .trim()
          .toLowerCase() === currentEmail
    );

    if (searchValue) {
      approvedItems = approvedItems.filter((i) =>
        `${i.title || ""} ${i.category || ""} ${i.location || ""} ${i.description || ""}`
          .toLowerCase()
          .includes(searchValue)
      );
    }

    if (typeValue !== "all") {
      approvedItems = approvedItems.filter((i) => i.type === typeValue);
    }

    if (categoryValue !== "All") {
      approvedItems = approvedItems.filter((i) => i.category === categoryValue);
    }

    if (approvedItems.length === 0) {
      const emptyHTML = `<div class="empty-message">No approved items found.</div>`;

      if (container.innerHTML !== emptyHTML) {
        container.innerHTML = emptyHTML;
      }

      return;
    }

    const currentHTML = approvedItems.map((item) => cardHTML(item, "browse")).join("");

    if (container.innerHTML === currentHTML) {
      return;
    }

    container.innerHTML = currentHTML;
  }

  // ================= MY REPORTS =================

  async function setupMyReportsPage() {
    if (page !== "my-reports") return;
    if (!requireStudent()) return;

    await loadItems();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;

    renderMyReports();
  }

  function renderMyReports() {
    const container = document.getElementById("myReportsContainer");
    if (!container) return;

    const currentEmail = String(currentUser?.email || "")
      .trim()
      .toLowerCase();

    const myItems = items.filter(
      (item) =>
        String(item.createdBy || "")
          .trim()
          .toLowerCase() === currentEmail &&
        item.hiddenByOwner !== true
    );

    if (myItems.length === 0) {
      container.innerHTML =
        `<div class="empty-message">You have not added any reports yet.</div>`;
      return;
    }

    container.innerHTML = myItems
      .map((item) => cardHTML(item, "my"))
      .join("");
  }

  window.markClaimed = async function () {
    alert("Please use the “Claim This Item” button from the Dashboard. A secure validation form will open before any claim is submitted.");
  };

  window.deleteReport = async function (id) {
    if (!confirm("Remove this report from My Reports?")) return;

    try {
      try {
        await apiRequest(`/api/items/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
      } catch (deleteError) {
        console.warn("DELETE item failed, trying fallback:", deleteError);
        await apiRequest(`/api/items/${encodeURIComponent(id)}/delete`, {
          method: "POST"
        });
      }

      await loadItems();
      renderMyReports();
    } catch (error) {
      console.error("Delete report error:", error);
      alert(error.message || "Failed to delete report");
    }
  };

  // ================= ADMIN =================

  async function setupAdminPage() {
    if (page !== "admin") return;
    if (!requireAdmin()) return;

    await loadItems();

    try {
      await loadClaimRequests();
    } catch (error) {
      console.error("Admin claim loading failed:", error);
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;

    const container = document.getElementById("adminReportsContainer");

    if (container) {
      if (items.length === 0) {
        container.innerHTML = `<div class="empty-message">No reports found.</div>`;
      } else {
        const visibleAdminItems = items;

        container.innerHTML = visibleAdminItems.length
          ? visibleAdminItems.map((item) => cardHTML(item, "admin")).join("")
          : `<div class="empty-message">No reports found.</div>`;
      }
    }

    updateAdminStats();
    renderClaimRequests();
  }

  function updateAdminStats() {
    const totalCount = document.getElementById("totalCount");
    const lostCount = document.getElementById("lostCount");
    const foundCount = document.getElementById("foundCount");
    const claimedCount = document.getElementById("claimedCount");
    const pendingCount = document.getElementById("pendingCount");
    const rejectedCount = document.getElementById("rejectedCount");

    if (totalCount) totalCount.innerText = items.length;
    if (lostCount) lostCount.innerText = items.filter((i) => i.type === "lost").length;
    if (foundCount) foundCount.innerText = items.filter((i) => i.type === "found").length;
    if (claimedCount) claimedCount.innerText = items.filter((i) => i.status === "claimed").length;
    if (pendingCount) pendingCount.innerText = items.filter((i) => i.approvalStatus === "pending").length;
    if (rejectedCount) rejectedCount.innerText = items.filter((i) => i.approvalStatus === "rejected").length;
  }

  function renderClaimRequests() {
    const container = document.getElementById("claimRequestsContainer");
    if (!container) return;

    if (claimRequests.length === 0) {
      container.innerHTML = `<div class="empty-message">No claim requests found.</div>`;
      return;
    }

    container.innerHTML = claimRequests
      .map((req) => {
        const claimId = getId(req);

        return `
          <div class="card claim-request-card">
            <div class="card-body">
              <div class="card-top">
                <div>
                  <div class="card-title">${req.itemTitle || "-"}</div>
                  <small>${req.itemCategory || "-"}</small>
                </div>
                <span class="badge ${req.status}">${req.status}</span>
              </div>

              <div class="card-info">
                <div><strong>Requester:</strong> ${req.requesterName || "-"}</div>
                <div><strong>Email:</strong> ${req.requesterEmail || "-"}</div>
                <div><strong>Phone:</strong> ${req.requesterPhone || "-"}</div>
                <div><strong>Requested At:</strong> ${formatDate(req.createdAt)}</div>
              </div>

              <div class="card-desc">
                <strong>Proof:</strong> ${req.reason || "-"}
              </div>

              <div class="trust-score-box">
                <div class="trust-score-head">
                  <div>
                    <strong>AI Trust Score</strong>
                    <div class="trust-score-value">${Number(req.trustScore || 0)}%</div>
                  </div>
                  <span class="risk-badge risk-${req.riskLevel || "medium"}">
                    ${(req.riskLevel || "medium").toUpperCase()} RISK
                  </span>
                </div>

                <div class="trust-meter">
                  <div
                    class="trust-meter-fill"
                    style="width: ${Math.max(0, Math.min(100, Number(req.trustScore || 0)))}%"
                  ></div>
                </div>

                <p><strong>Recommendation:</strong> ${req.aiRecommendation || "Manual review required"}</p>

                ${
                  Array.isArray(req.aiReasons) && req.aiReasons.length
                    ? `<ul class="trust-reasons">${req.aiReasons
                        .slice(0, 5)
                        .map((reason) => `<li>${reason}</li>`)
                        .join("")}</ul>`
                    : ""
                }
              </div>

              <div class="card-buttons">
                ${
                  req.status === "pending"
                    ? `
                      <button class="small-btn approve-btn" onclick="approveClaimRequest('${claimId}')">
                        Approve Claim
                      </button>

                      <button class="small-btn reject-btn" onclick="rejectClaimRequest('${claimId}')">
                        Reject Claim
                      </button>

                      <button class="small-btn delete-btn" onclick="deleteClaimRequest('${claimId}')">
                        Delete
                      </button>
                    `
                    : `
                      <span class="empty-message">Request ${req.status}</span>

                      <button class="small-btn delete-btn" onclick="deleteClaimRequest('${claimId}')">
                        Delete
                      </button>
                    `
                }
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  window.approveClaimRequest = async function (requestId) {
    if (!confirm("Approve this claim request?")) return;

    try {
      const response = await apiRequest(`/api/claims/${requestId}/approve`, {
        method: "PATCH"
      });

      console.log("[CLAIM APPROVED RESPONSE]", response);
      await loadClaimRequests();
      await loadItems();
      renderClaimRequests();
      updateAdminStats();
      alert("Claim request approved!");
    } catch (error) {
      console.error("Approve claim error:", error);
      alert(error.message || "Failed to approve claim request.");
    }
  };

  window.rejectClaimRequest = async function (requestId) {
    if (!confirm("Reject this claim request?")) return;

    try {
      const response = await apiRequest(`/api/claims/${requestId}/reject`, {
        method: "PATCH"
      });

      console.log("[CLAIM REJECTED RESPONSE]", response);
      await loadClaimRequests();
      renderClaimRequests();
      alert("Claim request rejected.");
    } catch (error) {
      console.error("Reject claim error:", error);
      alert(error.message || "Failed to reject claim request.");
    }
  };

  window.deleteClaimRequest = async function (requestId) {
    if (!confirm("Delete this claim request permanently?")) return;

    const cleanRequestId = String(requestId || "").trim();

    if (!cleanRequestId) {
      alert("Claim request ID is missing. Refresh the admin page and try again.");
      return;
    }

    try {
      try {
        await apiRequest(`/api/claims/${encodeURIComponent(cleanRequestId)}`, {
          method: "DELETE"
        });
      } catch (deleteError) {
        console.warn("DELETE claim request failed. Trying fallback endpoint:", deleteError);

        await apiRequest(
          `/api/claims/${encodeURIComponent(cleanRequestId)}/delete`,
          {
            method: "POST"
          }
        );
      }

      claimRequests = claimRequests.filter(
        (claim) => String(getId(claim)) !== cleanRequestId
      );

      renderClaimRequests();
      alert("Claim request deleted successfully.");

      // Re-sync with MongoDB after the optimistic UI update.
      await loadClaimRequests();
      renderClaimRequests();
    } catch (error) {
      console.error("Delete claim request error:", error);
      alert(
        error?.message && error.message !== "api_error"
          ? error.message
          : "Unable to delete claim request. Please refresh and try again."
      );
    }
  };

  window.approveReport = async function (id) {
    try {
      const updatedItem = await apiRequest(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus: "approved" })
      });

      console.log("[REPORT APPROVED RESPONSE]", updatedItem);
      await loadItems();

      const container = document.getElementById("adminReportsContainer");
      if (container) {
        const visibleAdminItems = items.filter((item) => item.status !== "claimed");
        container.innerHTML = visibleAdminItems.length
          ? visibleAdminItems.map((item) => cardHTML(item, "admin")).join("")
          : `<div class="empty-message">No active reports found.</div>`;
      }

      updateAdminStats();
    } catch (error) {
      console.error("Approve report error:", error);
      alert(error.message || "Failed to approve report");
    }
  };

  window.rejectReport = async function (id) {
    try {
      const updatedItem = await apiRequest(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus: "rejected" })
      });

      console.log("[REPORT REJECTED RESPONSE]", updatedItem);
      await loadItems();

      const container = document.getElementById("adminReportsContainer");
      if (container) {
        const visibleAdminItems = items.filter((item) => item.status !== "claimed");
        container.innerHTML = visibleAdminItems.length
          ? visibleAdminItems.map((item) => cardHTML(item, "admin")).join("")
          : `<div class="empty-message">No active reports found.</div>`;
      }

      updateAdminStats();
    } catch (error) {
      console.error("Reject report error:", error);
      alert(error.message || "Failed to reject report");
    }
  };

  window.adminDeleteReport = async function (id) {
    if (!confirm("Permanently delete this report?")) return;

    try {
      try {
        await apiRequest(`/api/items/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
      } catch (deleteError) {
        console.warn("DELETE item failed, trying fallback:", deleteError);
        await apiRequest(`/api/items/${encodeURIComponent(id)}/delete`, {
          method: "POST"
        });
      }

      items = items.filter((item) => String(getId(item)) !== String(id));
      await setupAdminPage();
    } catch (error) {
      console.error("Admin delete report error:", error);
      alert(error.message || "Failed to delete report");
    }
  };

  // ================= HELP CENTER =================

  function setupHelpCenterPage() {
    if (page !== "help-center") return;
    if (!requireStudent()) return;

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;
  }

  // ================= THANKYOU =================

  function setupThankyouPage() {
    if (page !== "thankyou") return;
    if (!requireStudent()) return;
  }

  // ================= DARK MODE =================

  function setupThemeToggle() {
    const themeToggle = document.getElementById("themeToggle");
    if (!themeToggle) return;

    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark") {
      document.body.classList.add("dark-mode");
      themeToggle.innerText = "☀️";
    }

    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");

      if (document.body.classList.contains("dark-mode")) {
        localStorage.setItem("theme", "dark");
        themeToggle.innerText = "☀️";
      } else {
        localStorage.setItem("theme", "light");
        themeToggle.innerText = "🌙";
      }
    });
  }

  // ================= INIT =================

  async function bootstrapApplication() {
    const protectedPages = new Set([
      "dashboard",
      "my-reports",
      "profile-setup",
      "admin",
      "help-center",
      "thankyou"
    ]);

    if (protectedPages.has(page) && getToken()) {
      await refreshCurrentUser();
    }

    setupModal();
    setupDashboardProfile();
    setupLoginPage();
    setupThemeToggle();
    setupRegisterPage();
    setupProfilePage();
    setupDashboardPage();
    setupMyReportsPage();
    setupAdminPage();
    setupHelpCenterPage();
    setupThankyouPage();
  }

  bootstrapApplication().catch((error) => {
    console.error("Application bootstrap failed:", error);
  });

  // ================= REAL AI CAMPUS CHATBOT + VOICE ASSISTANT =================

function setupCampusAssistant() {
  if (page !== "dashboard") return;

  const toggleBtn = document.getElementById("chatbotToggle");
  const chatbotBox = document.getElementById("chatbotBox");
  const closeBtn = document.getElementById("chatbotClose");
  const messagesBox = document.getElementById("chatbotMessages");
  const input = document.getElementById("chatbotInput");
  const sendBtn = document.getElementById("sendChatBtn");
  const voiceBtn = document.getElementById("voiceBtn");
  const soundToggleBtn = document.getElementById("chatbotSoundToggle");
  const quickBtns = document.querySelectorAll(".quick-chat");

  if (!toggleBtn || !chatbotBox || !messagesBox || !input || !sendBtn) return;

  let isSending = false;
  let chatbotSoundEnabled = localStorage.getItem("chatbotSoundEnabled") !== "false";

  function updateSoundButton() {
    if (!soundToggleBtn) return;

    soundToggleBtn.textContent = chatbotSoundEnabled ? "🔊" : "🔇";
    soundToggleBtn.setAttribute(
      "aria-label",
      chatbotSoundEnabled ? "Turn chatbot voice off" : "Turn chatbot voice on"
    );
    soundToggleBtn.title =
      chatbotSoundEnabled ? "Turn chatbot voice off" : "Turn chatbot voice on";
  }

  updateSoundButton();

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener("click", () => {
      chatbotSoundEnabled = !chatbotSoundEnabled;
      localStorage.setItem("chatbotSoundEnabled", String(chatbotSoundEnabled));

      if (!chatbotSoundEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      updateSoundButton();
    });
  }

  function addMessage(text, type) {
  const div = document.createElement("div");

  div.className =
    type === "user"
      ? "user-msg"
      : type === "typing"
      ? "bot-msg typing-msg"
      : "bot-msg";

  div.textContent = text;

  div.style.whiteSpace = "pre-wrap";
  div.style.wordBreak = "break-word";
  div.style.overflowWrap = "break-word";

  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  return div;
}

  function getLocalFallbackReply(question) {
    const q = String(question || "").toLowerCase();

    if (q.includes("report") || q.includes("lost") || q.includes("found")) {
      return "To report an item, go to Report Lost / Found Item section, fill details, upload photo, and submit. Admin will review it.";
    }

    if (q.includes("claim")) {
      return "To claim an item, open an approved item and click Claim This Item. Add proof/details. Admin will verify it.";
    }

    if (q.includes("ai") || q.includes("match") || q.includes("smart")) {
      return "AI Smart Match compares lost items with found items using title, category, location and description.";
    }

    if (q.includes("admin") || q.includes("approval") || q.includes("pending")) {
      return "After submitting a report, it goes to admin for review. Until approval, it stays pending.";
    }

    if (q.includes("email") || q.includes("mail")) {
      return "When a claim is approved, both reporter and claimer receive email notifications.";
    }

    if (q.includes("hello") || q.includes("hi")) {
      return "Hello! I can help you with reports, claims, AI match, approval status and notifications.";
    }

    return "I can help with report submission, claim requests, AI smart match, admin approval, profile and email notifications.";
  }

  function speakText(text) {
    if (!chatbotSoundEnabled) return;
    if (!("speechSynthesis" in window)) return;

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-IN";
    speech.rate = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  async function getAIReply(question) {
    try {
      const data = await apiRequest("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: question,
          user: {
            name: currentUser?.studentName || currentUser?.name || "Student",
            email: currentUser?.email || "",
            role: currentUser?.role || "student"
          }
        })
      });

      return data?.reply || data?.message || data?.answer || "AI assistant did not return a response.";
    } catch (error) {
      console.log("AI CHAT ERROR:", error);
      return getLocalFallbackReply(question);
    }
  }

 function typeBotReply(reply) {
  return new Promise((resolve) => {
    const botDiv = addMessage("", "bot");
    let i = 0;

    const cleanReply = String(reply || "")
      .replace(/\s+/g, " ")
      .trim();

    const interval = setInterval(() => {
      botDiv.textContent = cleanReply.substring(0, i + 1);
      i++;

      messagesBox.scrollTop = messagesBox.scrollHeight;

      if (i >= cleanReply.length) {
        clearInterval(interval);
        resolve();
      }
    }, 16);
  });
}

  async function handleSend(customText = "") {
    if (isSending) return;

    const question = customText || input.value.trim();
    if (!question) return;

    isSending = true;
    sendBtn.disabled = true;

    addMessage(question, "user");
    input.value = "";

    const typingDiv = addMessage("Typing...", "typing");

    try {
      const reply = await getAIReply(question);
      typingDiv.remove();
      await typeBotReply(reply);
      speakText(reply);
    } catch (error) {
      console.log("CHATBOT SEND ERROR:", error);
      typingDiv.remove();
      const fallback = "Sorry, something went wrong. Please try again.";
      addMessage(fallback, "bot");
      speakText(fallback);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  toggleBtn.onclick = () => {
    chatbotBox.classList.toggle("hidden");
    setTimeout(() => input.focus(), 100);
  };

  if (closeBtn) {
    closeBtn.onclick = () => {
      chatbotBox.classList.add("hidden");
    };
  }

  sendBtn.onclick = () => handleSend();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });

  quickBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      handleSend(btn.dataset.question || btn.innerText);
    });
  });

  if (voiceBtn) {
    voiceBtn.onclick = () => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert("Voice assistant is not supported in this browser. Please use Chrome.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      voiceBtn.innerText = "🎙️";
      recognition.start();

      recognition.onresult = (event) => {
        const voiceText = event.results[0][0].transcript;
        input.value = voiceText;
        handleSend(voiceText);
      };

      recognition.onerror = () => {
        alert("Voice not detected. Please try again.");
      };

      recognition.onend = () => {
        voiceBtn.innerText = "🎤";
      };
    };
  }
}

setupCampusAssistant();

// ================= REALTIME NOTIFICATIONS =================

let notificationAudioUnlocked = false;
let storedNotifications = [];
let notificationsLoaded = false;

document.addEventListener("click", () => { notificationAudioUnlocked = true; }, { once: true });
document.addEventListener("keydown", () => { notificationAudioUnlocked = true; }, { once: true });

function playNotificationSound() {
  try {
    if (!notificationAudioUnlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  } catch (error) {
    console.log("Notification sound error:", error);
  }
}

function setSocketStatus(connected, text) {
  let status = document.getElementById("campusSocketStatus");
  if (!status) {
    status = document.createElement("div");
    status.id = "campusSocketStatus";
    status.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:100001;padding:7px 10px;border-radius:999px;font:600 11px Arial;box-shadow:0 8px 25px rgba(0,0,0,.16)";
    document.body.appendChild(status);
  }
  status.style.background = connected ? "#dcfce7" : "#fee2e2";
  status.style.color = connected ? "#166534" : "#991b1b";
  status.textContent = text;
  status.classList.remove("hidden");
  clearTimeout(status.hideTimer);
  status.hideTimer = setTimeout(() => status.classList.add("hidden"), connected ? 1500 : 3500);
}

function notificationId(notification) {
  return String(notification?._id || notification?.id || "");
}

function showNotificationActionError(message) {
  const list = document.getElementById("campusNotificationList");
  if (!list) return;
  let error = document.getElementById("notificationActionError");
  if (!error) {
    error = document.createElement("p");
    error.id = "notificationActionError";
    error.className = "notification-action-error";
    list.prepend(error);
  }
  error.textContent = message;
  setTimeout(() => error.remove(), 3500);
}

function updateNotificationBadge() {
  const count = document.getElementById("campusNotificationCount");
  if (!count) return;
  const unread = storedNotifications.filter((item) => !item.isRead).length;
  count.textContent = unread > 99 ? "99+" : String(unread);
  count.classList.toggle("hidden", unread === 0);
}

function renderStoredNotifications() {
  const list = document.getElementById("campusNotificationList");
  if (!list) return;
  list.innerHTML = "";

  if (!storedNotifications.length) {
    list.innerHTML = `<p class="notification-empty">${notificationsLoaded ? "No notifications yet" : "Loading..."}</p>`;
    updateNotificationBadge();
    return;
  }

  storedNotifications.forEach((data) => {
    const item = document.createElement("div");
    item.className = `notification-item ${data.isRead ? "" : "unread"}`;

    const title = document.createElement("strong");
    title.textContent = data.title || "Notification";

    const message = document.createElement("p");
    message.textContent = data.message || "";

    const time = document.createElement("span");
    time.className = "notification-time";
    const parsedDate = new Date(data.createdAt || Date.now());
    time.textContent = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toLocaleString();

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "notification-delete";
    deleteButton.title = "Delete notification";
    deleteButton.setAttribute("aria-label", "Delete notification");
    deleteButton.textContent = "×";

    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const id = notificationId(data);
      if (!id) {
        showNotificationActionError("This notification has not been saved yet. Refresh and try again.");
        return;
      }

      deleteButton.disabled = true;
      const previousNotifications = [...storedNotifications];
      storedNotifications = storedNotifications.filter((entry) => notificationId(entry) !== id);
      renderStoredNotifications();

      try {
        await apiRequest(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch (error) {
        storedNotifications = previousNotifications;
        renderStoredNotifications();
        showNotificationActionError("Notification could not be deleted. Check backend deployment.");
        console.error("Delete notification failed:", error);
      }
    });

    item.append(title, message, time, deleteButton);
    list.appendChild(item);
  });

  updateNotificationBadge();
}

async function loadStoredNotifications() {
  try {
    const response = await apiRequest("/api/notifications");
    storedNotifications = Array.isArray(response) ? response : response?.notifications || [];
  } catch (error) {
    storedNotifications = [];
    showNotificationActionError("Saved notifications could not be loaded. Start or deploy the updated backend.");
    console.error("Load notifications failed:", error);
  } finally {
    notificationsLoaded = true;
    renderStoredNotifications();
  }
}

async function markAllNotificationsRead() {
  const unreadNotifications = storedNotifications.filter((item) => !item.isRead);
  if (!unreadNotifications.length) return;

  const previousNotifications = storedNotifications.map((item) => ({ ...item }));
  storedNotifications = storedNotifications.map((item) => ({ ...item, isRead: true }));
  renderStoredNotifications();

  try {
    await apiRequest("/api/notifications/read-all", { method: "PATCH" });
  } catch (error) {
    storedNotifications = previousNotifications;
    renderStoredNotifications();
    showNotificationActionError("Read status could not be saved.");
    console.error("Mark notifications read failed:", error);
  }
}

function createNotificationBell() {
  if (!currentUser) return;

  let bell = document.getElementById("campusNotificationBell");
  if (!bell) {
    const navActions = document.querySelector(".nav-actions");
    if (!navActions) return;
    bell = document.createElement("div");
    bell.id = "campusNotificationBell";
    bell.className = "notification-bell-wrapper";
    bell.innerHTML = `<button id="campusNotificationButton" class="notification-bell-button" type="button" aria-label="Open notifications" title="Notifications">🔔</button><span id="campusNotificationCount" class="notification-count hidden">0</span><div id="campusNotificationDropdown" class="notification-dropdown hidden"><div class="notification-dropdown-head"><h3>Notifications</h3><button id="campusClearNotifications" class="notification-clear-all" type="button">Clear all</button></div><div id="campusNotificationList"><p class="notification-empty">Loading...</p></div></div>`;
    const anchor = document.getElementById("profileBtn") || document.getElementById("logoutBtn");
    if (anchor?.parentElement === navActions) navActions.insertBefore(bell, anchor);
    else navActions.appendChild(bell);
  }

  const button = document.getElementById("campusNotificationButton");
  const dropdown = document.getElementById("campusNotificationDropdown");
  const clearButton = document.getElementById("campusClearNotifications");
  if (!button || !dropdown || !clearButton) return;

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const opening = dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden");
    if (opening) await markAllNotificationsRead();
  });

  dropdown.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => dropdown.classList.add("hidden"));

  clearButton.addEventListener("click", async () => {
    if (!storedNotifications.length) return;
    if (!window.confirm("Delete all notifications? This cannot be undone.")) return;

    clearButton.disabled = true;
    const previousNotifications = [...storedNotifications];
    storedNotifications = [];
    renderStoredNotifications();

    try {
      await apiRequest("/api/notifications", { method: "DELETE" });
    } catch (error) {
      storedNotifications = previousNotifications;
      renderStoredNotifications();
      showNotificationActionError("Notifications could not be cleared. Check backend deployment.");
      console.error("Clear notifications failed:", error);
    } finally {
      clearButton.disabled = false;
    }
  });

  loadStoredNotifications();
}

function showNotificationToast(data) {
  const toast = document.createElement("div");
  toast.className = "notification-toast";
  const title = document.createElement("strong");
  title.textContent = data.title || "Notification";
  const message = document.createElement("p");
  message.textContent = data.message || "";
  toast.append(title, message);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function receiveNotification(data = {}) {
  const id = notificationId(data);
  if (id && storedNotifications.some((item) => notificationId(item) === id)) return;

  storedNotifications.unshift({
    ...data,
    isRead: false,
    createdAt: data.createdAt || new Date().toISOString()
  });
  storedNotifications = storedNotifications.slice(0, 100);
  renderStoredNotifications();
  showNotificationToast(data);
  playNotificationSound();

  // Keep an already-open admin dashboard synchronized with database changes.
  // The notification is saved first, so reloading does not lose it.
  if (page === "admin" && ["report_deleted", "claim_completed"].includes(String(data.type || ""))) {
    setTimeout(() => window.location.reload(), 700);
  }
}

function setupRealtimeNotifications() {
  const token = getToken();
  if (!currentUser || !token || window.__campusSocket) return;

  const connectSocket = () => {
    if (typeof window.io !== "function") {
      setSocketStatus(false, "Live notifications unavailable");
      return;
    }

    const socket = window.io(API_BASE, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 15000
    });

    window.__campusSocket = socket;
    socket.on("connect", () => setSocketStatus(true, "Live notifications connected"));
    socket.on("campusNotification", receiveNotification);
    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      setSocketStatus(false, "Live notifications reconnecting");
    });
  };

  if (typeof window.io === "function") {
    connectSocket();
    return;
  }

  const script = document.createElement("script");
  script.src = `${API_BASE}/socket.io/socket.io.js?v=4.8.3`;
  script.async = true;
  script.onload = connectSocket;
  script.onerror = () => setSocketStatus(false, "Live notifications unavailable");
  document.head.appendChild(script);
}

if (currentUser && !["login", "register", "forgot-password", "reset-password"].includes(page)) {
  createNotificationBell();
  setupRealtimeNotifications();
}

// =========================================================
// RESPONSIVE NAVBAR + MULTI LANGUAGE
// =========================================================

function setupResponsiveNavigation() {
  const menuToggle = document.getElementById("mobileMenuToggle");
  const navLinks = document.getElementById("mainNavLinks");

  if (!menuToggle || !navLinks) {
    setupLanguageSwitcher();
    return;
  }

  let backdrop = document.getElementById("mobileMenuBackdrop");

  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "mobileMenuBackdrop";
    backdrop.className = "mobile-menu-backdrop";
    document.body.appendChild(backdrop);
  }

  const closeMenu = () => {
    navLinks.classList.remove("open");
    backdrop.classList.remove("show");
    document.body.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  };

  const openMenu = () => {
    navLinks.classList.add("open");
    backdrop.classList.add("show");
    document.body.classList.add("menu-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.textContent = "✕";
  };

  menuToggle.addEventListener("click", (event) => {
    event.stopPropagation();

    if (navLinks.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  backdrop.addEventListener("click", closeMenu);

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });

  const currentFile = window.location.pathname.split("/").pop() || "dashboard.html";

  navLinks.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href");

    if (href === currentFile) {
      link.classList.add("active");
    }
  });

  setupLanguageSwitcher();
}

function setupLanguageSwitcher() {
  const languageSelect = document.getElementById("languageSelect");
  if (!languageSelect) return;

  const translations = {
    en: {
      home: "Home",
      myReports: "My Reports",
      helpCenter: "Help Center",
      logout: "Logout",
      heroTitle: "Campus Lost & Found Portal",
      heroDescription:
        "Students can report lost or found items, browse approved reports, and connect with the owner or finder easily.",
      browseItems: "Browse Items",
      reportItem: "Report Item",
      totalReports: "Total Reports",
      lostItems: "Lost Items",
      foundItems: "Found Items",
      claimed: "Claimed",
      browseApproved: "Browse Approved Items",
      approvedDescription: "Only admin-approved reports are shown here.",
      allTypes: "All Types",
      lost: "Lost",
      found: "Found",
      allCategories: "All Categories",
      reportHeading: "Report Lost / Found Item",
      reportDescription: "Submit item details. Admin will review your report shortly.",
      submitReport: "Submit Report",
      myReportsHeading: "My Reports",
      myReportsDescription:
        "Track all your submitted lost and found reports with approval status.",
      helpHeading: "Help Center",
      helpDescription:
        "Need help with lost or found items? Contact the campus support team.",
      faqHeading: "Frequently Asked Questions",
      faqDescription: "Quick answers for common student queries.",
      adminPanel: "Admin Panel",
      manageReports: "Manage Reports",
      manageDescription:
        "Review student reports, approve valid items, reject incorrect reports, and manage campus lost and found records.",
      allStudentReports: "All Student Reports",
      allStudentDescription:
        "Approve, reject, view, or delete reports submitted by students.",
      claimRequests: "Claim Requests",
      claimDescription:
        "Review student claim requests and approve or reject ownership requests."
    },

    hi: {
      home: "होम",
      myReports: "मेरी रिपोर्ट्स",
      helpCenter: "सहायता केंद्र",
      logout: "लॉगआउट",
      heroTitle: "कैंपस लॉस्ट एंड फाउंड पोर्टल",
      heroDescription:
        "छात्र खोई या मिली वस्तुओं की रिपोर्ट कर सकते हैं, स्वीकृत रिपोर्ट देख सकते हैं और मालिक या खोजने वाले से संपर्क कर सकते हैं।",
      browseItems: "वस्तुएँ देखें",
      reportItem: "वस्तु रिपोर्ट करें",
      totalReports: "कुल रिपोर्ट्स",
      lostItems: "खोई वस्तुएँ",
      foundItems: "मिली वस्तुएँ",
      claimed: "क्लेम की गई",
      browseApproved: "स्वीकृत वस्तुएँ देखें",
      approvedDescription: "यहाँ केवल एडमिन द्वारा स्वीकृत रिपोर्ट दिखाई जाती हैं।",
      allTypes: "सभी प्रकार",
      lost: "खोई हुई",
      found: "मिली हुई",
      allCategories: "सभी श्रेणियाँ",
      reportHeading: "खोई / मिली वस्तु की रिपोर्ट करें",
      reportDescription: "वस्तु का विवरण जमा करें। एडमिन जल्द समीक्षा करेगा।",
      submitReport: "रिपोर्ट जमा करें",
      myReportsHeading: "मेरी रिपोर्ट्स",
      myReportsDescription:
        "अपनी सभी खोई और मिली वस्तुओं की रिपोर्ट तथा उनकी स्वीकृति स्थिति देखें।",
      helpHeading: "सहायता केंद्र",
      helpDescription:
        "खोई या मिली वस्तु से जुड़ी सहायता के लिए कैंपस सपोर्ट टीम से संपर्क करें।",
      faqHeading: "अक्सर पूछे जाने वाले प्रश्न",
      faqDescription: "छात्रों के सामान्य प्रश्नों के त्वरित उत्तर।",
      adminPanel: "एडमिन पैनल",
      manageReports: "रिपोर्ट प्रबंधन",
      manageDescription:
        "छात्रों की रिपोर्ट की समीक्षा करें, सही रिपोर्ट स्वीकृत करें, गलत रिपोर्ट अस्वीकार करें और रिकॉर्ड प्रबंधित करें।",
      allStudentReports: "सभी छात्र रिपोर्ट्स",
      allStudentDescription:
        "छात्रों द्वारा जमा रिपोर्ट को स्वीकृत, अस्वीकृत, देखें या हटाएँ।",
      claimRequests: "क्लेम अनुरोध",
      claimDescription:
        "छात्रों के क्लेम अनुरोध की समीक्षा करें और स्वामित्व अनुरोध को स्वीकृत या अस्वीकृत करें।"
    }
  };

  const applyLanguage = (language) => {
    const selected = translations[language] || translations.en;

    document.documentElement.lang = language === "hi" ? "hi" : "en";

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;

      if (selected[key]) {
        element.textContent = selected[key];
      }
    });

    localStorage.setItem("language", language);
    languageSelect.value = language;
  };

  const savedLanguage = localStorage.getItem("language") || "en";
  applyLanguage(savedLanguage);

  languageSelect.addEventListener("change", () => {
    applyLanguage(languageSelect.value);
  });
}

setupResponsiveNavigation();



  