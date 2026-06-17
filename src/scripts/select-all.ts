const selectAlls = document.querySelectorAll<HTMLInputElement>('.select-all');
selectAlls.forEach(cb => {
    cb.addEventListener('change', () => {
        document.querySelectorAll<HTMLInputElement>('.row-select').forEach(row => {
            row.checked = cb.checked;
        });
        selectAlls.forEach(other => { other.checked = cb.checked; });
    });
});
