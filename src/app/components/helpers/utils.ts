declare var bootstrap: any;

export function onClose() {
	const modalElement = document.getElementById("readModal");
	if (modalElement) {
		const modalInstance = bootstrap.Modal.getInstance(modalElement);
		if (modalInstance) {
			modalInstance.hide();
		} else {
			// console.info("Modal instance not found, creating a new one.");
			const newModalInstance = new bootstrap.Modal(modalElement);
			newModalInstance.hide();
		}
	} else {
		console.error("Modal element not found.");
	}
}
