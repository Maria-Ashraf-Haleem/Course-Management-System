import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Users, Zap } from "lucide-react";
import {
	listPendingEnrollmentRequests,
	approveEnrollmentRequest,
	rejectEnrollmentRequest,
} from "../../lib/api";

export default function PendingEnrollments() {
	const navigate = useNavigate();
	const [isLoading, setIsLoading] = useState(true);
	const [items, setItems] = useState<any[]>([]);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [courseFilter, setCourseFilter] = useState<string>("");
	const [bulkBusy, setBulkBusy] = useState(false);

	const loadData = async () => {
		try {
			setIsLoading(true);
			setError("");
			const { data } = await listPendingEnrollmentRequests();
			setItems(Array.isArray(data) ? data : []);
		} catch (e: any) {
			setError(e?.response?.data?.detail || "Failed to load pending requests");
			setItems([]);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const approve = async (id: number) => {
		try {
			await approveEnrollmentRequest(id);
			setItems((prev) => prev.filter((r) => r.enrollment_id !== id));
			// Notify interested pages (e.g., Dashboard) to refresh course counts immediately
			try {
				window.dispatchEvent(new CustomEvent("enrollmentApproved", { detail: { enrollmentId: id } }));
				window.dispatchEvent(new Event("pendingEnrollmentsChanged"));
			} catch {}
		} catch (e) {
			alert("Failed to approve request");
		}
	};

	const reject = async (id: number) => {
		try {
			await rejectEnrollmentRequest(id);
			setItems((prev) => prev.filter((r) => r.enrollment_id !== id));
			try {
				window.dispatchEvent(new Event("pendingEnrollmentsChanged"));
			} catch {}
		} catch (e) {
			alert("Failed to reject request");
		}
	};

	// Derived filtering helpers
	const normalizedQuery = query.trim().toLowerCase();
	const courseMap = new Map<string, string>();
	for (const i of items) {
		const code = i?.course_code ?? "";
		if (!code) continue;
		if (!courseMap.has(code)) {
			courseMap.set(code, `${i?.course_title ?? "Unknown"} (${code})`);
		}
	}
	const courses = Array.from(courseMap.entries()).map(([code, label]) => ({ code, label }));

	const filteredItems = items.filter((req) => {
		const matchesCourse = !courseFilter || req.course_code === courseFilter;
		if (!normalizedQuery) return matchesCourse;
		const hay = `${req.student_name ?? ""} ${req.course_title ?? ""} ${req.course_code ?? ""}`.toLowerCase();
		return matchesCourse && hay.includes(normalizedQuery);
	});

	const approveAll = async () => {
		if (filteredItems.length === 0) return;
		const ok = confirm(`Approve all ${filteredItems.length} pending request(s) currently listed?`);
		if (!ok) return;
		setBulkBusy(true);
		try {
			const ids = filteredItems.map((r) => r.enrollment_id);
			for (const id of ids) {
				try {
					await approveEnrollmentRequest(id);
					try {
						window.dispatchEvent(new CustomEvent("enrollmentApproved", { detail: { enrollmentId: id } }));
					} catch {}
				} catch (e) {
					// continue
				}
			}
			setItems((prev) => prev.filter((r) => !ids.includes(r.enrollment_id)));
			try {
				window.dispatchEvent(new Event("pendingEnrollmentsChanged"));
			} catch {}
		} finally {
			setBulkBusy(false);
		}
	};

	const rejectAll = async () => {
		if (filteredItems.length === 0) return;
		const ok = confirm(`Reject all ${filteredItems.length} pending request(s) currently listed?`);
		if (!ok) return;
		setBulkBusy(true);
		try {
			const ids = filteredItems.map((r) => r.enrollment_id);
			for (const id of ids) {
				try {
					await rejectEnrollmentRequest(id);
				} catch (e) {
					// continue
				}
			}
			setItems((prev) => prev.filter((r) => !ids.includes(r.enrollment_id)));
			try {
				window.dispatchEvent(new Event("pendingEnrollmentsChanged"));
			} catch {}
		} finally {
			setBulkBusy(false);
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gray-200 flex items-center justify-center">
				<div className="text-center">
					<div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
						<Users className="w-8 h-8 text-white" />
					</div>
					<p className="text-gray-800 font-medium">Loading pending requests...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-200">
			<div className="w-full mx-auto px-6 py-8">
				<div className="flex items-center gap-3 mb-6">
					<button
						onClick={() => navigate("/instructor/dashboard")}
						className="p-2 text-gray-800 hover:bg-gray-300/70 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-5 h-5" />
					</button>
					<div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
						<Zap className="w-5 h-5 text-white" />
					</div>
					<h1 className="text-xl font-black text-gray-900">Pending Enrollment Requests</h1>
				</div>

				{error && (
					<div className="mb-4 text-red-700 bg-red-500/10 border border-red-400/30 p-3 rounded-xl text-sm">
						{error}
					</div>
				)}

				{/* Filters and bulk actions */}
				<div className="bg-white/60 border border-gray-300 rounded-2xl p-4 mb-4">
					<div className="flex flex-col md:flex-row md:items-end gap-3">
						<div className="flex-1">
							<label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search by student or course..."
								className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
							/>
						</div>
						<div className="w-full md:w-64">
							<label className="block text-xs font-medium text-gray-700 mb-1">Course</label>
							<select
								value={courseFilter}
								onChange={(e) => setCourseFilter(e.target.value)}
								className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
							>
								<option value="">All courses</option>
								{courses.map((c) => (
									<option key={c.code} value={c.code}>{c.label}</option>
								))}
							</select>
						</div>
						<div className="flex gap-2">
							<button
								onClick={approveAll}
								disabled={bulkBusy || filteredItems.length === 0}
								className="px-3 py-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-700 rounded-lg text-sm hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
							>
								<CheckCircle className="w-4 h-4" /> Accept All
							</button>
							<button
								onClick={rejectAll}
								disabled={bulkBusy || filteredItems.length === 0}
								className="px-3 py-2 bg-red-500/20 border border-red-400/40 text-red-700 rounded-lg text-sm hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
							>
								<XCircle className="w-4 h-4" /> Reject All
							</button>
						</div>
					</div>
					<div className="mt-2 text-xs text-gray-700">Showing {filteredItems.length} of {items.length} pending</div>
				</div>

				{filteredItems.length === 0 ? (
					<div className="bg-gray-100/70 border border-gray-300 rounded-2xl p-6 text-center text-gray-800">
						No pending requests.
					</div>
				) : (
					<div className="space-y-3">
						{filteredItems.map((req) => (
							<div key={req.enrollment_id} className="bg-gray-100/70 border border-gray-300 rounded-2xl p-4 flex items-center justify-between">
								<div>
									<p className="text-gray-900 font-medium">{req.student_name}</p>
									<p className="text-gray-700 text-sm">{req.course_title} ({req.course_code})</p>
									<p className="text-gray-600 text-xs">{new Date(req.requested_at).toLocaleString()}</p>
								</div>
								<div className="flex items-center gap-2">
									<button onClick={() => approve(req.enrollment_id)} className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-700 rounded-lg text-sm hover:bg-emerald-500/30 flex items-center gap-1">
										<CheckCircle className="w-4 h-4" /> Approve
									</button>
									<button onClick={() => reject(req.enrollment_id)} className="px-3 py-1.5 bg-red-500/20 border border-red-400/30 text-red-700 rounded-lg text-sm hover:bg-red-500/30 flex items-center gap-1">
										<XCircle className="w-4 h-4" /> Reject
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

