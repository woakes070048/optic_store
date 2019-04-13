import Vue from 'vue/dist/vue.js';

import PrescriptionForm from '../components/PrescriptionForm.vue';
import {
  get_all_rx_params,
  get_signed_fields,
  get_prec2_fields,
} from '../utils/constants';
import { format } from '../utils/format';

function enable_sph_reading(side) {
  const field = `sph_reading_${side}`;
  return function(frm) {
    frm.toggle_enable(field, frm.doc[`add_type_${side}`] === '');
  };
}

function handle_sph_reading(side) {
  const field = `sph_reading_${side}`;
  return function(frm) {
    const fval =
      parseFloat(frm.doc[`sph_${side}`] || 0) +
      parseFloat(frm.doc[`add_${side}`] || 0);
    frm.set_value(field, format(field, fval));
  };
}

function toggle_detail_entry(frm, state) {
  frm.toggle_display('details_simple_sec', !state);
  frm.toggle_display(['details_sec', 'pd_sec', 'prism_sec', 'iop_sec'], state);
}

function calc_total_pd(frm) {
  const { pd_right = 0, pd_left = 0 } = frm.doc;
  const fval = parseFloat(pd_right) + parseFloat(pd_left);
  frm.set_value('pd_total', fval.toFixed(1));
}

function update_fields(frm) {
  const signed_fields = get_signed_fields();
  const prec2_fields = get_prec2_fields();
  function get_re(field) {
    if (signed_fields.includes(field)) {
      return /^(\+|-)?\d*\.?\d{0,2}$/;
    }
    if (field.includes('axis')) {
      return /^\d{0,3}$/;
    }
    if (field.includes('va')) {
      return /^\d*\/?\d*$/;
    }
    if (prec2_fields.includes(field)) {
      return /^\d*\.?\d{0,2}$/;
    }
    if (field.includes('pd')) {
      return /^\d*\.?\d{0,1}$/;
    }
  }
  function scrub(field, value) {
    const re = get_re(field);
    if (re) {
      return re.test(value) ? value : frm.doc[field];
    }
    return value;
  }
  return function(field, value) {
    const scrubbed = scrub(field, value);
    frm.set_value(field, scrubbed);
    return scrubbed;
  };
}

function blur_fields(frm) {
  return function(field, value) {
    if (field.includes('sph') || field.includes('add')) {
      // considers cases where the user might just enter '+' or '-', hence the + '.0'
      const fval = parseFloat((value || '') + '.0');
      frm.set_value(field, format(field, fval));
    }
    if (field.includes('cyl')) {
      const fval = Math.round(parseFloat((value || '') + '.0') * 4) / 4;
      frm.set_value(field, format(field, fval));
    }
  };
}

function render_detail_vue(frm) {
  const { $wrapper } = frm.get_field('details_html');
  $wrapper.empty();
  if (frm.doc.__islocal) {
    // this makes the below fields reactive in vue
    frm.doc = Object.assign(
      frm.doc,
      get_all_rx_params().reduce(
        (a, x) => Object.assign(a, { [x]: undefined }),
        {}
      ),
      { pd_total: undefined }
    );
  }
  return new Vue({
    el: $wrapper.html('<div />').children()[0],
    data: { doc: frm.doc },
    render: function(h) {
      return h(PrescriptionForm, {
        props: {
          doc: this.doc,
          update: update_fields(frm),
          fields: frm.fields_dict,
          blur: blur_fields(frm),
        },
      });
    },
  });
}

function setup_route_back(frm) {
  if (frappe._from_link && frappe._from_link.frm) {
    const { doctype, docname } = frappe._from_link.frm;
    // disable native route back for save events. will handle submits by own
    frappe._from_link.frm = null;
    return ['Form', doctype, docname];
  }
  return null;
}

function set_expiry_date(frm) {
  frm.set_value(
    'expiry_date',
    frappe.datetime.add_months(frm.doc.test_date, 6)
  );
}

function copy_to_reading(param, side) {
  return function(frm) {
    frm.set_value(`${param}_reading_${side}`, frm.doc[`${param}_${side}`]);
  };
}

export default {
  setup: async function(frm) {
    const { message: settings = {} } = await frappe.db.get_value(
      'Optical Store Settings',
      null,
      'prescription_entry'
    );
    toggle_detail_entry(frm, settings.prescription_entry === 'ERPNext');
  },
  onload: function(frm) {
    enable_sph_reading(frm);
    frm.detail_vue = render_detail_vue(frm);
    frm.route_back = setup_route_back(frm);
  },
  refresh: function(frm) {
    frm.detail_vue.doc = frm.doc;
    if (frm.doc.__islocal) {
      set_expiry_date(frm);
    }
  },
  test_date: set_expiry_date,
  on_submit: async function(frm) {
    if (frm.route_back) {
      await frappe.set_route(frm.route_back);
      if (frappe._from_link_scrollY) {
        frappe.utils.scroll_to(frappe._from_link_scrollY);
      }
    }
  },
  sph_right: copy_to_reading('sph', 'right'),
  cyl_right: copy_to_reading('cyl', 'right'),
  axis_right: copy_to_reading('axis', 'right'),
  va_right: copy_to_reading('va', 'right'),
  bc_right: copy_to_reading('bc', 'right'),
  dia_right: copy_to_reading('dia', 'right'),
  sph_left: copy_to_reading('sph', 'left'),
  cyl_left: copy_to_reading('cyl', 'left'),
  axis_left: copy_to_reading('axis', 'left'),
  va_left: copy_to_reading('va', 'left'),
  bc_left: copy_to_reading('bc', 'left'),
  dia_left: copy_to_reading('dia', 'left'),
  add_right: function(frm) {
    handle_sph_reading('right')(frm);
    frm.set_value('add_left', frm.doc.add_right);
  },
  add_left: handle_sph_reading('left'),
  add_type_right: function(frm) {
    enable_sph_reading('right')(frm);
    frm.set_value('add_type_left', frm.doc.add_type_right);
  },
  add_type_left: enable_sph_reading('left'),
  pd_right: calc_total_pd,
  pd_left: calc_total_pd,
};
