window.addEventListener('DOMContentLoaded', () => {
    const base_url = '{{BASE_URL}}'
    const deploy_date = new Date('{{DEPLOY_DATE}}')

    // Cache DOM elements first
    const submitButton = $('#submit-button')
    const deleteButton = $('#delete-button')
    const pasteEditArea = $('#paste-textarea')
    const submitErrMsg = $('#submit-error-msg')
    const fileInput = $('#paste-tab-file input[type="file"]')

    // Set default values for create paste
    let urlType = 'short'
    let inputType = 'edit'
    let expiration = '7d'
    let passwd = ''
    let customName = '', adminUrl = '', file = null

    // Set default expiration
    $('#paste-expiration-input').val(expiration)

    // Check if we're accessing an admin URL
    const pathname = window.location.pathname
    if (pathname.includes(':')) {
        // Switch to edit mode
        $('#create-paste-tab-text').text('Edit Paste')
        
        // Switch to the create/edit tab
        const createPasteTab = new bootstrap.Tab($('#create-paste-tab'))
        createPasteTab.show()

        // Extract the admin URL
        const adminUrl = base_url + pathname
        $('#paste-url-admin-radio').prop('checked', true)
        $('#admin-url-input-group').show()
        $('#paste-admin-url-input').val(adminUrl)

        // Fetch the paste content and metadata
        $.get({
            url: base_url + pathname.split(':')[0],
            success: (content) => {
                $('#paste-textarea').val(content)
                // Enable the submit button since we have content
                submitButton.prop('disabled', false)
                    .removeClass('btn-secondary')
                    .addClass('btn-primary')
                submitErrMsg.text('')
            },
            error: handleError
        })

        // Get the admin token from the URL
        const adminToken = pathname.split(':')[1]
        if (adminToken) {
            passwd = adminToken
            $('#paste-passwd-input').val(adminToken)
        }

        // Enable the delete button
        deleteButton.removeClass('d-none').prop('disabled', false)
            .addClass('btn-danger')
    }

    // Initialize Bootstrap components
    const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    tooltips.forEach(tooltip => new bootstrap.Tooltip(tooltip))

    // Focus the get paste input on page load
    $('#pastebin-id').focus()

    // Handle get paste functionality
    function handleGetPaste() {
        const pasteId = $('#pastebin-id').val().trim()
        if (pasteId) {
            window.location.href = `${base_url}/${pasteId}`
        } else {
            handleError({ statusText: 'Please enter a valid PasteBin ID or URL.' })
        }
    }

    // Handle enter key in get paste input
    $('#pastebin-id').on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            e.preventDefault()
            handleGetPaste()
        }
    })

    // Handle go button click
    $('#go-button').on('click', handleGetPaste)

    // Handle paste content changes
    function updateSubmitButton() {
        const hasContent = inputType === 'edit' 
            ? pasteEditArea.val().trim().length > 0 
            : file !== null

        if (hasContent) {
            submitButton.prop('disabled', false)
                .removeClass('btn-secondary')
                .addClass('btn-primary')
            submitErrMsg.text('')
        } else {
            submitButton.prop('disabled', true)
                .removeClass('btn-primary')
                .addClass('btn-secondary')
            submitErrMsg.text('Paste is empty')
        }
    }

    // Initialize submit button state
    updateSubmitButton()

    // Handle text input
    pasteEditArea.on('input', updateSubmitButton)

    // Handle file upload
    fileInput.on('change', function(event) {
        const files = event.target.files
        if (files.length === 0) return
        
        file = files[0]
        inputType = 'file'
        updateSubmitButton()
        
        const fileLine = $('#paste-file-line')
        fileLine.children('.file-name').text(file.name)
        fileLine.children('.file-size').text(formatSize(file.size))
        
        $('#paste-file-show').removeClass('d-none')
        $('#paste-edit').addClass('d-none')
    })

    // Handle switching back to text mode
    $('#paste-tab-edit').on('click', () => {
        inputType = 'edit'
        file = null
        $('#paste-file-show').addClass('d-none')
        $('#paste-edit').removeClass('d-none')
        updateSubmitButton()
    })

    // Handle form submission
    submitButton.on('click', () => {
        if (!submitButton.prop('disabled')) {
            submitButton.prop('disabled', true)
                .removeClass('btn-primary')
                .addClass('btn-secondary')
            postPaste()
        }
    })

    // Handle URL type selection
    $('input[name="url-type"]').on('change', function() {
        urlType = $(this).val()
        
        // Show/hide custom URL input
        if (urlType === 'custom') {
            $('#custom-url-input-group').show()
        } else {
            $('#custom-url-input-group').hide()
        }
        
        // Show/hide admin URL input
        if (urlType === 'admin') {
            $('#admin-url-input-group').show()
            deleteButton.removeClass('d-none')
        } else {
            $('#admin-url-input-group').hide()
            deleteButton.addClass('d-none')
        }
    })

    // Initially hide the custom and admin URL inputs
    $('#custom-url-input-group, #admin-url-input-group').hide()

    // Handle other input fields
    $('#paste-expiration-input').on('input', function() {
        expiration = $(this).val() || '7d'
    })

    $('#paste-passwd-input').on('input', function() {
        passwd = $(this).val()
    })

    $('#paste-custom-url-input').on('input', function() {
        customName = $(this).val()
    })

    $('#paste-admin-url-input').on('input', function() {
        adminUrl = $(this).val()
    })

    // Handle paste submission
    function postPaste() {
        const fd = new FormData()
        
        // Add content
        if (inputType === 'file') {
            fd.append('c', file)
        } else {
            fd.append('c', pasteEditArea.val())
        }

        // Add other fields
        fd.append('e', expiration)
        if (passwd) fd.append('s', passwd)
        if (urlType === 'long') fd.append('p', 'true')
        if (urlType === 'custom' && customName) fd.append('n', customName)

        // Determine if we're updating an existing paste
        const isUpdate = window.location.pathname.includes(':')
        const method = isUpdate ? 'PUT' : 'POST'
        
        // For updates, include the admin token in the URL
        let submitUrl = base_url
        if (isUpdate) {
            const pathname = window.location.pathname
            const [pastePath, adminToken] = pathname.split(':')
            submitUrl = base_url + pastePath + ':' + adminToken
        }

        $.ajax({
            url: submitUrl,
            method: method,
            data: fd,
            processData: false,
            contentType: false,
            success: (data) => {
                renderUploaded(data)
                showToast('successToast')
            },
            error: handleError,
        })
    }

    // Helper functions
    function showToast(toastId) {
        const toastEl = document.getElementById(toastId)
        const toast = new bootstrap.Toast(toastEl)
        toast.show()
    }

    function handleError(error) {
        submitButton.prop('disabled', false)
            .removeClass('btn-secondary')
            .addClass('btn-primary')
        
        const status = error.status || ''
        const statusText = error.statusText === 'error' ? 'Unknown error' : error.statusText
        const responseText = error.responseText || ''
        
        $('#errorToastBody').text(`Error ${status}: ${statusText}\n${responseText}`)
        showToast('errorToast')
    }

    function renderUploaded(uploaded) {
        $('#paste-uploaded-panel').removeClass('d-none')
        $('#uploaded-url').val(uploaded.url)
        $('#uploaded-admin-url').val(uploaded.admin)
        
        if (uploaded.suggestUrl) {
            $('#uploaded-suggest-url').val(uploaded.suggestUrl)
        }
        if (uploaded.expire) {
            $('#uploaded-expiration').val(uploaded.expire)
        }
    }

    function formatSize(size) {
        if (!size) return '0'
        const units = ['Bytes', 'KB', 'MB', 'GB']
        let i = 0
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024
            i++
        }
        return `${size.toFixed(2)} ${units[i]}`
    }

    function getDateString(date) {
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
    }

    // Set deployment date
    $('#deploy-date').text(getDateString(deploy_date))

    // Handle copy buttons
    $('.copy-button').on('click', function() {
        const input = $(this).siblings('input').first()
        input.select()
        try {
            document.execCommand('copy')
            $(this).html('<i class="bi bi-check"></i> Copied!')
            setTimeout(() => {
                $(this).html('<i class="bi bi-clipboard"></i> Copy')
            }, 2000)
        } catch (err) {
            handleError({ statusText: 'Failed to copy content' })
        }
    })
})
