$(async function() {
  function refresh() {
    return doCall(() => $.getJSON('api'));
  }

  async function perform(action, parameters) {
    return doCall(() => $.ajax({
      type: 'POST',
      url: 'api',
      dataType: 'json', // Expect
      contentType: 'application/json', // Send
      data: JSON.stringify({ action, parameters }),
    }));
  }

  async function doCall(fn) {
    $('#oops').text('').hide();
    try {
      const data = await fn();

      $('#requestIp').text(data.requestIp);
      $('#clientIp').text(data.clientIp);
      $('#instanceState').text(data.instanceState);
      $('#start-btn').attr('disabled', data.instanceState !== 'stopped');
      $('#stop-btn').attr('disabled', data.instanceState !== 'running');
      $('#publicIpAddress').text(data.publicIpAddress || '(not running)');
      $('#update-to-me-btn').attr('disabled', false);
      if (data.password) {
        $('#adminPassword').text(data.password);
      }
      $('#copy-public-ip').attr('disabled', !data.publicIpAddress);
      $('#copy-password-btn').attr('disabled', !data.password);

      console.log(data);
    } catch (e) {
      $('#oops').text(JSON.stringify(e.responseJSON, undefined, 2)).show();
    }
  }

  $('#poll-btn').click(refresh);
  $('#update-to-me-btn').click(() => perform('updateToMe', {
    ipAddress: $('#requestIp').text(),
  }));
  $('#start-btn').click(() => perform('start', {}));
  $('#stop-btn').click(() => perform('stop', {}));
  $('#password-btn').click(() => perform('retrievePassword', {}));

  $('#copy-public-ip').click(makeCopier($('#publicIpAddress')));
  $('#copy-password-btn').click(makeCopier($('#adminPassword')));

  function makeCopier(el) {
    return () => {
      navigator.clipboard.writeText(el.text());
      showPopover(el, 'Copied to clipboard');
    };
  }

  function showPopover(el, message) {
    const pos = el.offset();

    const element = $('<div>').text(message).css({
      position: 'absolute',
      left: pos.left,
      top: pos.top + el.height(),
    }).addClass('popover').appendTo(document.body);

    element.fadeOut(2000, () => {
      element.remove();
    });
  }

  refresh();
});