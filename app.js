  console.log("NEW APP.JS LOADED - AI MATCH TEST");
  const API_BASE = window.__API_BASE__ || "http://localhost:5000";


  const USER_KEY = "user";
  const AUTH_TOKEN_KEY = "authToken";
  const DEFAULT_IMAGE =
    "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-size='28'%3ENo Image%3C/text%3E%3C/svg%3E";

  let currentUser = getStoredUser();
  let items = [];
  let claimRequests = [];

  const page = document.body.dataset.page || "";

  // ================= BASIC HELPERS =================

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY)) || null;
    } catch {
      return null;
    }
  }

  function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  function saveToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  }

  function logout() {
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

  async function apiRequest(path, options = {}) {
    const token = getToken();

    const res = await fetch(`${API_BASE}${path}`, {
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
        (data && data.error) ||
        (data && data.message) ||
        text ||
        "api_error"
      );
    }

    return data;
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
    if (!currentUser || currentUser.role !== "student") {
      go("login.html");
      return false;
    }
    return true;
  }

  function requireAdmin() {
    if (!currentUser || currentUser.role !== "admin") {
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

    form.onsubmit = async (e) => {
      e.preventDefault();

      const email = document.getElementById("loginEmail").value.trim().toLowerCase();
      const password = document.getElementById("loginPassword").value.trim();

      try {
        const res = await apiRequest("/api/users/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        const user = res.user || res;

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

    form.onsubmit = async (e) => {
      e.preventDefault();

      const name = document.getElementById("registerName").value.trim();
      const email = document.getElementById("registerEmail").value.trim().toLowerCase();
      const password = document.getElementById("registerPassword").value.trim();

      try {
        await apiRequest("/api/users/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password })
        });

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

        currentUser = updatedUser;
        saveUser(updatedUser);

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
      claimRequests = await apiRequest("/api/claims");
    } catch {
      claimRequests = [];
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
              type === "browse" && item.status !== "claimed"
                ? `
                  <button class="small-btn claim-btn" onclick="openClaimRequest('${itemId}')">
                    Claim This Item
                  </button>
                `
                : ""
            }

            ${
              type === "my"
                ? `
                  ${
                    item.approvalStatus === "approved" && item.status !== "claimed"
                      ? `<button class="small-btn claim-btn" onclick="markClaimed('${itemId}')">Mark Claimed</button>`
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

    if (!modal || !modalContent) return;

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
    const item = items.find((i) => String(getId(i)) === String(id));
    if (!item) return;

    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modalContent");

    if (!modal || !modalContent) return;

    modalContent.innerHTML = `
      <div class="claim-form">
        <h2>Claim Request</h2>

        <p class="claim-item">
          Item: <strong>${item.title || "-"}</strong>
        </p>

        <label>Why is this item yours?</label>

        <textarea 
          id="claimReason"
          rows="5"
          placeholder="Enter proof/details..."
        ></textarea>

        <button 
          class="btn primary full-btn"
          onclick="submitClaimRequest('${getId(item)}')"
        >
          Submit Claim Request
        </button>
      </div>
    `;

    modal.classList.remove("hidden");
  };

  window.submitClaimRequest = async function (id) {
    const item = items.find((i) => String(getId(i)) === String(id));

    if (!item) {
      alert("Item not found. Please refresh the page.");
      return;
    }

    const itemId = getId(item);
    const reason = document.getElementById("claimReason").value.trim();

    if (!itemId) {
      alert("Item ID missing. Please refresh and try again.");
      return;
    }

    if (!reason) {
      alert("Please enter proof/details before submitting.");
      return;
    }

    try {
      await apiRequest("/api/claims", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          reason
        })
      });

      alert("Claim request submitted successfully!");

      const modal = document.getElementById("modal");

      if (modal) {
        modal.classList.add("hidden");
      }

      await loadItems();
      renderDashboardItems();

    } catch (error) {
      console.log(error);
      alert(error.message || "Failed to submit claim request.");
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
          console.log(error);
          setMessage(successMessage, "Failed to submit report", "red");
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
      (i) =>
        i.approvalStatus === "approved" &&
        String(i.createdBy || "").trim().toLowerCase() === currentEmail
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

    const container = document.getElementById("myReportsContainer");

    if (!container) return;

    const currentEmail = String(currentUser.email || "").trim().toLowerCase();

    const myItems = items.filter(
      (item) => String(item.createdBy || "").trim().toLowerCase() === currentEmail
    );

    if (myItems.length === 0) {
      container.innerHTML = `<div class="empty-message">You have not added any reports yet.</div>`;
      return;
    }

    container.innerHTML = myItems.map((item) => cardHTML(item, "my")).join("");
  }

  window.markClaimed = async function (id) {
    try {
      await apiRequest(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "claimed" })
      });

      location.reload();
    } catch {
      alert("Failed to update report");
    }
  };

  window.deleteReport = async function (id) {
    if (!confirm("Delete this report?")) return;

    try {
      await apiRequest(`/api/items/${id}`, {
        method: "DELETE"
      });

      location.reload();
    } catch {
      alert("Failed to delete report");
    }
  };

  // ================= ADMIN =================

  async function setupAdminPage() {
    if (page !== "admin") return;
    if (!requireAdmin()) return;

    await loadItems();
    await loadClaimRequests();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;

    const container = document.getElementById("adminReportsContainer");

    if (container) {
      if (items.length === 0) {
        container.innerHTML = `<div class="empty-message">No reports found.</div>`;
      } else {
        container.innerHTML = items.map((item) => cardHTML(item, "admin")).join("");
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
      await apiRequest(`/api/claims/${requestId}/approve`, {
        method: "PATCH"
      });

      alert("Claim request approved!");
      location.reload();
    } catch {
      alert("Failed to approve claim request.");
    }
  };

  window.rejectClaimRequest = async function (requestId) {
    if (!confirm("Reject this claim request?")) return;

    try {
      await apiRequest(`/api/claims/${requestId}/reject`, {
        method: "PATCH"
      });

      alert("Claim request rejected.");
      location.reload();
    } catch {
      alert("Failed to reject claim request.");
    }
  };

  window.deleteClaimRequest = async function (requestId) {
    if (!confirm("Delete this claim request?")) return;

    try {
      await apiRequest(`/api/claims/${requestId}`, {
        method: "DELETE"
      });

      alert("Claim request deleted.");
      location.reload();
    } catch {
      alert("Failed to delete claim request.");
    }
  };

  window.approveReport = async function (id) {
    try {
      await apiRequest(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus: "approved" })
      });

      location.reload();
    } catch {
      alert("Failed to approve report");
    }
  };

  window.rejectReport = async function (id) {
    try {
      await apiRequest(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalStatus: "rejected" })
      });

      location.reload();
    } catch {
      alert("Failed to reject report");
    }
  };

  window.adminDeleteReport = async function (id) {
    if (!confirm("Delete this report?")) return;

    try {
      await apiRequest(`/api/items/${id}`, {
        method: "DELETE"
      });

      location.reload();
    } catch {
      alert("Failed to delete report");
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

  setupModal();
  setupLoginPage();
  setupThemeToggle();
  setupRegisterPage();
  setupProfilePage();
  setupDashboardPage();
  setupMyReportsPage();
  setupAdminPage();
  setupHelpCenterPage();
  setupThankyouPage();

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
  const quickBtns = document.querySelectorAll(".quick-chat");

  if (!toggleBtn || !chatbotBox || !messagesBox || !input || !sendBtn) return;

  let isSending = false;

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

// ================= REALTIME NOTIFICATION BELL =================

let notificationAudioUnlocked = false;

function unlockNotificationSound() {
  notificationAudioUnlocked = true;
  document.removeEventListener("click", unlockNotificationSound);
  document.removeEventListener("keydown", unlockNotificationSound);
}

document.addEventListener("click", unlockNotificationSound);
document.addEventListener("keydown", unlockNotificationSound);

function playNotificationSound() {
  try {
    if (!notificationAudioUnlocked) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.36);
  } catch (error) {
    console.log("Notification sound error:", error);
  }
}

function setupRealtimeNotifications() {
  if (!currentUser) return;
  if (window.__campusSocketLoaded) return;

  window.__campusSocketLoaded = true;

  const script = document.createElement("script");
  script.src = `${API_BASE}/socket.io/socket.io.js`;

  script.onload = () => {
    if (typeof io === "undefined") {
      console.log("Socket.io client not found.");
      return;
    }

    const socket = io(API_BASE, {
      transports: ["websocket", "polling"]
    });

    socket.emit("joinUser", {
      email: currentUser.email,
      role: currentUser.role
    });

    socket.on("campusNotification", (data) => {
      showNotificationToast(data);
      addBellNotification(data);
      playNotificationSound();
    });
  };

  script.onerror = () => {
    console.log("Socket.io script failed to load.");
  };

  document.body.appendChild(script);
}

function createNotificationBell() {
  if (!currentUser) return;
  if (document.getElementById("bellBtn")) return;

  const bell = document.createElement("div");
  bell.className = "notification-bell";

  bell.innerHTML = `
    <button id="bellBtn" type="button">🔔</button>
    <span id="bellCount" class="bell-count hidden">0</span>

    <div id="bellDropdown" class="bell-dropdown hidden">
      <h3>Notifications</h3>
      <div id="bellList">
        <p class="no-notification">No notifications yet</p>
      </div>
    </div>
  `;

  document.body.appendChild(bell);

  const bellBtn = document.getElementById("bellBtn");
  const bellDropdown = document.getElementById("bellDropdown");
  const bellCount = document.getElementById("bellCount");

  bellBtn.onclick = () => {
    bellDropdown.classList.toggle("hidden");
    bellCount.classList.add("hidden");
    bellCount.innerText = "0";
  };
}

function addBellNotification(data) {
  const list = document.getElementById("bellList");
  const count = document.getElementById("bellCount");

  if (!list || !count) return;

  const oldEmpty = list.querySelector(".no-notification");
  if (oldEmpty) oldEmpty.remove();

  const item = document.createElement("div");
  item.className = "bell-item";

  item.innerHTML = `
    <strong>${data.title || "Notification"}</strong>
    <p>${data.message || ""}</p>
  `;

  list.prepend(item);

  const nextCount = Number(count.innerText || 0) + 1;
  count.innerText = nextCount;
  count.classList.remove("hidden");
}

function showNotificationToast(data) {
  const toast = document.createElement("div");
  toast.className = "notification-toast";

  toast.innerHTML = `
    <strong>${data.title || "Notification"}</strong>
    <p>${data.message || ""}</p>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4500);
}

createNotificationBell();
setupRealtimeNotifications();