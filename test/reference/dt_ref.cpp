// darktable's color zones, the module the extension ports, run over fixed
// params (darktable's own presets among them) and Lab pixels and printed as
// JSON. darktable 5.6.1 (release-5.6.1), © darktable developers,
// GPL-3.0-or-later. Single precision throughout, as darktable runs it.

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "splines.h"

// ── shims for the darktable vocabulary (common/math.h) ───────────────────────

typedef float dt_aligned_pixel_t[4];
#define M_SQRT2_F 1.41421356237309504880f
#define DT_2PI_F 6.28318530717958647693f
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define CLAMP(x, low, high) (((x) > (high)) ? (high) : (((x) < (low)) ? (low) : (x)))
static inline float sqrf(const float a) { return a * a; }
static inline float dt_fast_hypotf(const float x, const float y) { return sqrtf(x * x + y * y); }

// ── common/colorspaces_inline_conversions.h (verbatim) ───────────────────────

static inline void dt_Lab_2_LCH(const dt_aligned_pixel_t Lab, dt_aligned_pixel_t LCH)
{
  float var_H = atan2f(Lab[2], Lab[1]);

  if(var_H > 0.0f)
    var_H = var_H / DT_2PI_F;
  else
    var_H = 1.0f - fabsf(var_H) / DT_2PI_F;

  LCH[0] = Lab[0];
  LCH[1] = hypotf(Lab[1], Lab[2]);
  LCH[2] = var_H;
}

static inline void dt_LCH_2_Lab(const dt_aligned_pixel_t LCH, dt_aligned_pixel_t Lab)
{
  Lab[0] = LCH[0];
  Lab[1] = cosf(DT_2PI_F * LCH[2]) * LCH[1];
  Lab[2] = sinf(DT_2PI_F * LCH[2]) * LCH[1];
}

// ── gui/draw.h, the curve object (verbatim, OpenMP pragmas dropped) ──────────

typedef struct dt_draw_curve_t
{
  CurveData c;
  CurveSample csample;
} dt_draw_curve_t;

static inline dt_draw_curve_t *dt_draw_curve_new(const float min, const float max, const unsigned int type)
{
  dt_draw_curve_t *c = (dt_draw_curve_t *)malloc(sizeof(dt_draw_curve_t));
  c->csample.m_samplingRes = 0x10000;
  c->csample.m_outputRes = 0x10000;
  c->csample.m_Samples = (uint16_t *)malloc(sizeof(uint16_t) * 0x10000);

  c->c.m_spline_type = type;
  c->c.m_numAnchors = 0;
  c->c.m_min_x = 0.0;
  c->c.m_max_x = 1.0;
  c->c.m_min_y = 0.0;
  c->c.m_max_y = 1.0;
  return c;
}

static inline void dt_draw_curve_destroy(dt_draw_curve_t *c)
{
  free(c->csample.m_Samples);
  free(c);
}

static inline void dt_draw_curve_smaple_values(dt_draw_curve_t *c, const float min, const float max, const int res,
                                               float *x, float *y)
{
  if(x)
  {
    for(int k = 0; k < res; k++) x[k] = k * (1.0f / res);
  }
  if(y)
  {
    for(int k = 0; k < res; k++) y[k] = min + (max - min) * c->csample.m_Samples[k] * (1.0f / 0x10000);
  }
}

static inline void dt_draw_curve_calc_values_V2_nonperiodic(dt_draw_curve_t *c, const float min, const float max,
                                                            const int res, float *x, float *y)
{
  c->csample.m_samplingRes = res;
  c->csample.m_outputRes = 0x10000;
  CurveDataSampleV2(&c->c, &c->csample);
  dt_draw_curve_smaple_values(c, min, max, res, x, y);
}

static inline void dt_draw_curve_calc_values_V2_periodic(dt_draw_curve_t *c, const float min, const float max,
                                                         const int res, float *x, float *y)
{
  c->csample.m_samplingRes = res;
  c->csample.m_outputRes = 0x10000;
  CurveDataSampleV2Periodic(&c->c, &c->csample);
  dt_draw_curve_smaple_values(c, min, max, res, x, y);
}

static inline void dt_draw_curve_calc_values_V2(dt_draw_curve_t *c, const float min, const float max,
                                                const int res, float *x, float *y, const bool periodic)
{
  if(periodic)
    dt_draw_curve_calc_values_V2_periodic(c, min, max, res, x, y);
  else
    dt_draw_curve_calc_values_V2_nonperiodic(c, min, max, res, x, y);
}

static inline void dt_draw_curve_add_point(dt_draw_curve_t *c, const float x, const float y)
{
  c->c.m_anchors[c->c.m_numAnchors].x = x;
  c->c.m_anchors[c->c.m_numAnchors].y = y;
  c->c.m_numAnchors++;
}

// ── iop/colorzones.c (verbatim but for the pipe plumbing) ────────────────────

#define DT_IOP_COLORZONES_LUT_RES 0x10000
#define DT_IOP_COLORZONES_MAXNODES 20

typedef enum dt_iop_colorzones_modes_t
{
  DT_IOP_COLORZONES_MODE_SMOOTH = 0,
  DT_IOP_COLORZONES_MODE_STRONG = 1
} dt_iop_colorzones_modes_t;

typedef enum dt_iop_colorzones_channel_t
{
  DT_IOP_COLORZONES_L = 0,
  DT_IOP_COLORZONES_C = 1,
  DT_IOP_COLORZONES_h = 2,
  DT_IOP_COLORZONES_MAX_CHANNELS = 3
} dt_iop_colorzones_channel_t;

typedef struct dt_iop_colorzones_node_t
{
  float x;
  float y;
} dt_iop_colorzones_node_t;

typedef struct dt_iop_colorzones_params_t
{
  dt_iop_colorzones_channel_t channel;
  dt_iop_colorzones_node_t curve[DT_IOP_COLORZONES_MAX_CHANNELS][DT_IOP_COLORZONES_MAXNODES];
  int curve_num_nodes[DT_IOP_COLORZONES_MAX_CHANNELS];
  int curve_type[DT_IOP_COLORZONES_MAX_CHANNELS];
  float strength;
  dt_iop_colorzones_modes_t mode;
  int splines_version;
} dt_iop_colorzones_params_t;

typedef struct dt_iop_colorzones_data_t
{
  dt_draw_curve_t *curve[DT_IOP_COLORZONES_MAX_CHANNELS];
  int curve_nodes[DT_IOP_COLORZONES_MAX_CHANNELS];
  int curve_type[DT_IOP_COLORZONES_MAX_CHANNELS];
  dt_iop_colorzones_channel_t channel;
  float lut[3][DT_IOP_COLORZONES_LUT_RES];
  int mode;
} dt_iop_colorzones_data_t;

static float lookup(const float *lut, const float i)
{
  const int bin0 = MIN(0xffff, MAX(0, (int)(DT_IOP_COLORZONES_LUT_RES * i)));
  const int bin1 = MIN(0xffff, MAX(0, (int)(DT_IOP_COLORZONES_LUT_RES * i) + 1));
  const float f = DT_IOP_COLORZONES_LUT_RES * i - bin0;
  return lut[bin1] * f + lut[bin0] * (1.f - f);
}

static inline float strength(const float value, const float strength)
{
  return value + (value - 0.5f) * (strength / 100.0f);
}

static void _reset_nodes(dt_iop_colorzones_params_t *p, const int ch, const bool touch_edges)
{
  for(int k = 0; k < p->curve_num_nodes[ch]; k++)
  {
    if(touch_edges)
      p->curve[ch][k].x = (float)k / (float)(p->curve_num_nodes[ch] - 1);
    else
      p->curve[ch][k].x = ((float)k + 0.5f) / (float)p->curve_num_nodes[ch];
    p->curve[ch][k].y = 0.5f;
  }
}

static void _reset_parameters(dt_iop_colorzones_params_t *p, const int channel, const int splines_version)
{
  for(int ch = 0; ch < DT_IOP_COLORZONES_MAX_CHANNELS; ch++)
  {
    p->curve_num_nodes[ch] = 2;
    p->curve_type[ch] = CATMULL_ROM;
    _reset_nodes(p, ch, channel != DT_IOP_COLORZONES_h);
  }
  p->strength = 0.0f;
  p->channel = (dt_iop_colorzones_channel_t)channel;
  p->mode = DT_IOP_COLORZONES_MODE_SMOOTH;
  p->splines_version = splines_version;
}

// commit_params(), the splines version 2 branch, on a fresh pipe piece.
static void commit_params(const dt_iop_colorzones_params_t *p, dt_iop_colorzones_data_t *d)
{
  d->channel = (dt_iop_colorzones_channel_t)p->channel;
  d->mode = p->mode;
  for(int ch = 0; ch < DT_IOP_COLORZONES_MAX_CHANNELS; ch++)
  {
    d->curve[ch] = dt_draw_curve_new(0.f, 1.f, p->curve_type[ch]);
    d->curve_nodes[ch] = p->curve_num_nodes[ch];
    d->curve_type[ch] = p->curve_type[ch];
    for(int k = 0; k < p->curve_num_nodes[ch]; k++)
      dt_draw_curve_add_point(d->curve[ch], p->curve[ch][k].x, strength(p->curve[ch][k].y, p->strength));
    dt_draw_curve_calc_values_V2(d->curve[ch], 0.f, 1.f, DT_IOP_COLORZONES_LUT_RES, NULL, d->lut[ch],
                                 p->channel == DT_IOP_COLORZONES_h);
    dt_draw_curve_destroy(d->curve[ch]);
  }
}

static void process_v1(const dt_iop_colorzones_data_t *d, const float *in, float *out)
{
  const float normalize_C = 1.f / (128.0f * M_SQRT2_F);
  dt_aligned_pixel_t LCh;
  dt_Lab_2_LCH(in, LCh);
  float select = 0.0f;
  switch(d->channel)
  {
    case DT_IOP_COLORZONES_L:
      select = LCh[0] * 0.01f;
      break;
    case DT_IOP_COLORZONES_C:
      select = LCh[1] * normalize_C;
      break;
    case DT_IOP_COLORZONES_h:
    default:
      select = LCh[2];
      break;
  }
  select = CLAMP(select, 0.f, 1.f);

  LCh[0] *= powf(2.0f, 4.0f * (lookup(d->lut[0], select) - .5f));
  LCh[1] *= 2.f * lookup(d->lut[1], select);
  LCh[2] += lookup(d->lut[2], select) - .5f;

  dt_LCH_2_Lab(LCh, out);
}

static void process_v3(const dt_iop_colorzones_data_t *d, const float *in, float *out)
{
  const float a = in[1], b = in[2];
  const float h = fmodf(atan2f(b, a) + DT_2PI_F, DT_2PI_F) / DT_2PI_F;
  const float C = dt_fast_hypotf(b, a);
  float select = 0.0f;
  float blend = 0.0f;
  switch(d->channel)
  {
    case DT_IOP_COLORZONES_L:
      select = fminf(1.0f, in[0] / 100.0f);
      break;
    case DT_IOP_COLORZONES_C:
      select = fminf(1.0f, C / 128.0f);
      break;
    default:
    case DT_IOP_COLORZONES_h:
      select = h;
      blend = sqrf(1.0f - C / 128.0f);
      break;
  }
  const float Lm = (blend * .5f + (1.0f - blend) * lookup(d->lut[0], select)) - .5f;
  const float hm = (blend * .5f + (1.0f - blend) * lookup(d->lut[2], select)) - .5f;
  blend *= blend;
  const float Cm = 2.0f * lookup(d->lut[1], select);
  const float L = in[0] * powf(2.0f, 4.0f * Lm);
  out[0] = L;
  out[1] = cosf(DT_2PI_F * (h + hm)) * Cm * C;
  out[2] = sinf(DT_2PI_F * (h + hm)) * Cm * C;
}

// ── darktable's presets (init_presets, verbatim but for the database calls) ──

#define DT_IOP_COLORZONES_BANDS 8
#define DT_IOP_COLORZONES_SPLINES_V2 1

struct Named
{
  const char *name;
  dt_iop_colorzones_params_t p;
};

static std::vector<Named> presets()
{
  std::vector<Named> out;
  dt_iop_colorzones_params_t p;
  memset(&p, 0, sizeof(p));

  p.strength = 0.f;
  p.mode = DT_IOP_COLORZONES_MODE_SMOOTH;
  p.splines_version = DT_IOP_COLORZONES_SPLINES_V2;

  // red black white
  p.channel = DT_IOP_COLORZONES_h;
  for(int k = 0; k < DT_IOP_COLORZONES_BANDS - 1; k++)
  {
    p.curve[DT_IOP_COLORZONES_L][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_C][k].y = .0f;
    p.curve[DT_IOP_COLORZONES_h][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_L][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_C][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_h][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
  }
  p.curve[DT_IOP_COLORZONES_C][0].y =
    p.curve[DT_IOP_COLORZONES_C][DT_IOP_COLORZONES_BANDS - 1].y = 0.65f;
  p.curve[DT_IOP_COLORZONES_C][1].x = 3.f / 16.f;
  p.curve[DT_IOP_COLORZONES_C][3].x = 0.50f;
  p.curve[DT_IOP_COLORZONES_C][4].x = 0.51f;
  p.curve[DT_IOP_COLORZONES_C][6].x = 15.f / 16.f;
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = DT_IOP_COLORZONES_BANDS - 1;
    p.curve_type[c] = CATMULL_ROM;
  }
  out.push_back({ "B&W: with red", p });

  // black white and skin tones
  p.channel = DT_IOP_COLORZONES_h;
  for(int k = 0; k < DT_IOP_COLORZONES_BANDS - 1; k++)
  {
    p.curve[DT_IOP_COLORZONES_L][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_C][k].y = .0f;
    p.curve[DT_IOP_COLORZONES_h][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_L][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_C][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_h][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
  }
  p.curve[DT_IOP_COLORZONES_C][0].y = 0.5f;
  p.curve[DT_IOP_COLORZONES_C][2].x = 0.25f;
  p.curve[DT_IOP_COLORZONES_C][1].x = 0.16f;
  p.curve[DT_IOP_COLORZONES_C][1].y = 0.3f;
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = DT_IOP_COLORZONES_BANDS - 1;
    p.curve_type[c] = CATMULL_ROM;
  }
  out.push_back({ "B&W: with skin tones", p });

  // polarizing filter
  p.channel = DT_IOP_COLORZONES_C;
  for(int k = 0; k < DT_IOP_COLORZONES_BANDS; k++)
  {
    p.curve[DT_IOP_COLORZONES_L][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_C][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_h][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_L][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_C][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_h][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
  }
  for(int k = 3; k < DT_IOP_COLORZONES_BANDS; k++)
    p.curve[DT_IOP_COLORZONES_C][k].y +=
      (k - 2.5f) / (DT_IOP_COLORZONES_BANDS - 2.0f) * 0.25f;
  for(int k = 4; k < DT_IOP_COLORZONES_BANDS; k++)
    p.curve[DT_IOP_COLORZONES_L][k].y -=
      (k - 3.5f) / (DT_IOP_COLORZONES_BANDS - 3.0f) * 0.35f;
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = DT_IOP_COLORZONES_BANDS;
    p.curve_type[c] = CATMULL_ROM;
  }
  out.push_back({ "polarizing filter", p });

  // natural skin tone
  p.channel = DT_IOP_COLORZONES_h;
  for(int k = 0; k < DT_IOP_COLORZONES_BANDS - 1; k++)
  {
    p.curve[DT_IOP_COLORZONES_L][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_C][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_h][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_L][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_C][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_h][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
  }
  p.curve[DT_IOP_COLORZONES_C][1].y = .45f;
  p.curve[DT_IOP_COLORZONES_h][1].y = .55f;
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = DT_IOP_COLORZONES_BANDS - 1;
    p.curve_type[c] = CATMULL_ROM;
  }
  out.push_back({ "natural skin tones", p });

  // black and white film
  p.channel = DT_IOP_COLORZONES_h;
  for(int k = 0; k < DT_IOP_COLORZONES_BANDS - 1; k++)
  {
    p.curve[DT_IOP_COLORZONES_C][k].y = .0f;
    p.curve[DT_IOP_COLORZONES_h][k].y = .5f;
    p.curve[DT_IOP_COLORZONES_C][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
    p.curve[DT_IOP_COLORZONES_h][k].x = k / (DT_IOP_COLORZONES_BANDS - 1.f);
  }
  p.curve[DT_IOP_COLORZONES_L][0].x = 0.000000f;
  p.curve[DT_IOP_COLORZONES_L][0].y = 0.613040f;
  p.curve[DT_IOP_COLORZONES_L][1].x = 0.010000f;
  p.curve[DT_IOP_COLORZONES_L][1].y = 0.613040f;
  p.curve[DT_IOP_COLORZONES_L][2].x = 0.245283f;
  p.curve[DT_IOP_COLORZONES_L][2].y = 0.447962f;
  p.curve[DT_IOP_COLORZONES_L][3].x = 0.498113f;
  p.curve[DT_IOP_COLORZONES_L][3].y = 0.529201f;
  p.curve[DT_IOP_COLORZONES_L][4].x = 0.641509f;
  p.curve[DT_IOP_COLORZONES_L][4].y = 0.664967f;
  p.curve[DT_IOP_COLORZONES_L][5].x = 0.879245f;
  p.curve[DT_IOP_COLORZONES_L][5].y = 0.777294f;
  p.curve[DT_IOP_COLORZONES_L][6].x = 0.990000f;
  p.curve[DT_IOP_COLORZONES_L][6].y = 0.613040f;
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = DT_IOP_COLORZONES_BANDS - 1;
    p.curve_type[c] = CATMULL_ROM;
  }
  out.push_back({ "B&W: film", p });

  // neutral preset with just a set of nodes uniformly distributed along the hue axis
  const int colorzones_bands_hsl = 8;
  p.channel = DT_IOP_COLORZONES_h;
  for(int k = 0; k < colorzones_bands_hsl; k++)
  {
    p.curve[DT_IOP_COLORZONES_L][k].x = (float)k / colorzones_bands_hsl;
    p.curve[DT_IOP_COLORZONES_L][k].y = 0.5f;
    p.curve[DT_IOP_COLORZONES_C][k].x = (float)k / colorzones_bands_hsl;
    p.curve[DT_IOP_COLORZONES_C][k].y = 0.5f;
    p.curve[DT_IOP_COLORZONES_h][k].x = (float)k / colorzones_bands_hsl;
    p.curve[DT_IOP_COLORZONES_h][k].y = 0.5f;
  }
  for(int c = 0; c < 3; c++)
  {
    p.curve_num_nodes[c] = colorzones_bands_hsl;
    p.curve_type[c] = MONOTONE_HERMITE;
  }
  out.push_back({ "HSL base setting", p });

  return out;
}

// ── the cases ────────────────────────────────────────────────────────────────

typedef std::vector<dt_iop_colorzones_node_t> Nodes;

// One curve of a case; no nodes keeps _reset_parameters' two flat ones.
struct CurveSpec
{
  int type;
  Nodes nodes;
};

struct Case
{
  const char *name;
  int channel;
  int mode;
  float strength;
  CurveSpec L, C, h;
};

static const CurveSpec FLAT = { CATMULL_ROM, {} };

static const Nodes LUM = { { 0.f, 0.5f }, { 0.3f, 0.8f }, { 0.7f, 0.3f }, { 1.f, 0.5f } };
static const Nodes CHROMA = { { 0.f, 0.7f }, { 0.4f, 0.6f }, { 1.f, 0.2f } };
static const Nodes BANDS = { { 0.0625f, 0.5f }, { 0.1875f, 0.8f }, { 0.3125f, 0.45f }, { 0.4375f, 0.6f },
                             { 0.5625f, 0.2f }, { 0.6875f, 0.5f }, { 0.8125f, 0.7f }, { 0.9375f, 0.35f } };
static const Nodes HUE_SHIFT = { { 0.0625f, 0.5f }, { 0.1875f, 0.62f }, { 0.3125f, 0.4f }, { 0.4375f, 0.55f },
                                 { 0.5625f, 0.3f }, { 0.6875f, 0.5f }, { 0.8125f, 0.66f }, { 0.9375f, 0.45f } };
static const Nodes LIFT = { { 0.f, 0.62f }, { 0.35f, 0.45f }, { 0.75f, 0.4f }, { 1.f, 0.55f } };

static const std::vector<Case> CASES = {
  // the chroma curve alone, each axis and rule
  { "chroma by lightness, centripetal", 0, 0, 0.f, FLAT, { CATMULL_ROM, LUM }, FLAT },
  { "chroma by lightness, cubic", 0, 0, 0.f, FLAT, { CUBIC_SPLINE, LUM }, FLAT },
  { "chroma by lightness, monotone", 0, 0, 0.f, FLAT, { MONOTONE_HERMITE, LUM }, FLAT },
  { "chroma by chroma", 1, 0, 0.f, FLAT, { CATMULL_ROM, CHROMA }, FLAT },
  { "chroma by hue, centripetal", 2, 0, 0.f, FLAT, { CATMULL_ROM, BANDS }, FLAT },
  { "chroma by hue, cubic", 2, 0, 0.f, FLAT, { CUBIC_SPLINE, BANDS }, FLAT },
  { "chroma by hue, monotone", 2, 0, 0.f, FLAT, { MONOTONE_HERMITE, BANDS }, FLAT },
  // the lightness curve
  { "lightness by lightness", 0, 0, 0.f, { CATMULL_ROM, LIFT }, FLAT, FLAT },
  { "lightness by chroma, cubic", 1, 0, 0.f, { CUBIC_SPLINE, LIFT }, FLAT, FLAT },
  { "lightness by hue (fades to grey)", 2, 0, 0.f, { CATMULL_ROM, BANDS }, FLAT, FLAT },
  { "lightness by hue, monotone", 2, 0, 0.f, { MONOTONE_HERMITE, HUE_SHIFT }, FLAT, FLAT },
  // the hue curve
  { "hue by hue", 2, 0, 0.f, FLAT, FLAT, { CATMULL_ROM, HUE_SHIFT } },
  { "hue by hue, cubic", 2, 0, 0.f, FLAT, FLAT, { CUBIC_SPLINE, HUE_SHIFT } },
  { "hue by lightness", 0, 0, 0.f, FLAT, FLAT, { CATMULL_ROM, LIFT } },
  { "hue by chroma, monotone", 1, 0, 0.f, FLAT, FLAT, { MONOTONE_HERMITE, LIFT } },
  { "hue, a half turn", 2, 0, 0.f, FLAT, FLAT, { CATMULL_ROM, { { 0.25f, 1.f }, { 0.75f, 1.f } } } },
  // all three at once, each with its own rule
  { "all three by hue", 2, 0, 0.f, { CUBIC_SPLINE, HUE_SHIFT }, { CATMULL_ROM, BANDS }, { MONOTONE_HERMITE, HUE_SHIFT } },
  { "all three by lightness", 0, 0, 0.f, { CATMULL_ROM, LIFT }, { MONOTONE_HERMITE, CHROMA }, { CUBIC_SPLINE, LUM } },
  { "all three by chroma", 1, 0, 0.f, { MONOTONE_HERMITE, LIFT }, { CUBIC_SPLINE, CHROMA }, { CATMULL_ROM, LUM } },
  // the mix
  { "all three by hue, mix +80", 2, 0, 80.f, { CUBIC_SPLINE, HUE_SHIFT }, { CATMULL_ROM, BANDS }, { MONOTONE_HERMITE, HUE_SHIFT } },
  { "all three by lightness, mix -150", 0, 0, -150.f, { CATMULL_ROM, LIFT }, { MONOTONE_HERMITE, CHROMA }, { CUBIC_SPLINE, LUM } },
  // strong mode
  { "strong, all three by hue", 2, 1, 0.f, { CUBIC_SPLINE, HUE_SHIFT }, { CATMULL_ROM, BANDS }, { MONOTONE_HERMITE, HUE_SHIFT } },
  { "strong, all three by lightness", 0, 1, 0.f, { CATMULL_ROM, LIFT }, { MONOTONE_HERMITE, CHROMA }, { CUBIC_SPLINE, LUM } },
  { "strong, all three by chroma", 1, 1, 0.f, { MONOTONE_HERMITE, LIFT }, { CUBIC_SPLINE, CHROMA }, { CATMULL_ROM, LUM } },
  // odd shapes
  { "hue, node at 1", 2, 0, 0.f, { CATMULL_ROM, { { 0.1f, 0.6f }, { 0.5f, 0.4f }, { 1.f, 0.55f } } },
    FLAT, { CUBIC_SPLINE, { { 0.f, 0.58f }, { 0.4f, 0.45f }, { 0.98f, 0.52f } } } },
  { "inner end nodes", 0, 0, 0.f, { CUBIC_SPLINE, { { 0.2f, 0.6f }, { 0.6f, 0.4f }, { 0.85f, 0.55f } } },
    { CATMULL_ROM, { { 0.2f, 0.8f }, { 0.6f, 0.4f }, { 0.85f, 0.6f } } }, FLAT },
  { "one node each", 2, 0, 0.f, { CATMULL_ROM, { { 0.5f, 0.6f } } }, { MONOTONE_HERMITE, { { 0.3f, 0.35f } } },
    { CUBIC_SPLINE, { { 0.7f, 0.55f } } } },
  { "twenty nodes each", 2, 0, 0.f, { CUBIC_SPLINE, {} }, { MONOTONE_HERMITE, {} }, { CATMULL_ROM, {} } },
};

// Twenty nodes, each curve its own wave. Marked by an empty node list on a
// "twenty" case.
static Nodes twenty(const bool periodic, const float phase)
{
  Nodes n;
  for(int k = 0; k < 20; k++)
  {
    const float x = periodic ? (k + 0.5f) / 20.f : k / 19.f;
    n.push_back({ x, 0.5f + 0.2f * sinf(5.3f * x + 0.4f * k + phase) });
  }
  return n;
}

static void set_curve(dt_iop_colorzones_params_t *p, const int ch, const CurveSpec &spec, const Nodes &fallback)
{
  p->curve_type[ch] = spec.type;
  const Nodes &nodes = spec.nodes.empty() ? fallback : spec.nodes;
  if(nodes.empty()) return;
  p->curve_num_nodes[ch] = (int)nodes.size();
  for(size_t i = 0; i < nodes.size(); i++) p->curve[ch][i] = nodes[i];
}

static dt_iop_colorzones_params_t params_of(const Case &k)
{
  dt_iop_colorzones_params_t p;
  memset(&p, 0, sizeof(p));
  _reset_parameters(&p, k.channel, DT_IOP_COLORZONES_SPLINES_V2);
  p.mode = (dt_iop_colorzones_modes_t)k.mode;
  p.strength = k.strength;
  const bool many = strstr(k.name, "twenty") != NULL;
  const bool periodic = k.channel == DT_IOP_COLORZONES_h;
  set_curve(&p, DT_IOP_COLORZONES_L, k.L, many ? twenty(periodic, 0.f) : Nodes());
  set_curve(&p, DT_IOP_COLORZONES_C, k.C, many ? twenty(periodic, 1.f) : Nodes());
  set_curve(&p, DT_IOP_COLORZONES_h, k.h, many ? twenty(periodic, 2.f) : Nodes());
  return p;
}

static void lab_inputs(std::vector<float> &lab)
{
  const float Ls[] = { -3.f, 0.f, 2.f, 12.f, 30.f, 50.f, 68.f, 85.f, 100.f, 118.f };
  const float Cs[] = { 0.f, 0.5f, 6.f, 24.f, 55.f, 90.f, 128.f, 165.f, 270.f };
  for(const float L : Ls)
    for(const float C : Cs)
      for(int k = 0; k < 12; k++)
      {
        const float hue = (k * 30.f + 7.f * (k % 3)) * 0.0174532925f;
        lab.push_back(L);
        lab.push_back(C * cosf(hue));
        lab.push_back(C * sinf(hue));
      }
  // exact axes: b = 0 on both sides and a = 0
  const float axes[][3] = { { 50.f, 40.f, 0.f }, { 50.f, -40.f, 0.f }, { 50.f, 0.f, 40.f }, { 50.f, 0.f, -40.f },
                            { 50.f, 40.f, -0.f } };
  for(const auto &p : axes) lab.insert(lab.end(), p, p + 3);
}

static void print_floats(const float *v, const size_t n)
{
  printf("[");
  for(size_t i = 0; i < n; i++) printf("%s%.9g", i ? "," : "", v[i]);
  printf("]");
}

static void print_case(const char *name, const dt_iop_colorzones_params_t &p, const std::vector<float> &lab,
                       const std::vector<float> &selects, const bool first)
{
  dt_iop_colorzones_data_t *d = (dt_iop_colorzones_data_t *)calloc(1, sizeof(dt_iop_colorzones_data_t));
  commit_params(&p, d);

  const size_t pixels = lab.size() / 3;
  std::vector<float> out(lab.size());
  for(size_t i = 0; i < pixels; i++)
  {
    if(p.mode == DT_IOP_COLORZONES_MODE_SMOOTH)
      process_v3(d, &lab[3 * i], &out[3 * i]);
    else
      process_v1(d, &lab[3 * i], &out[3 * i]);
  }

  printf("%s{\"name\":\"%s\",\"selectBy\":%d,\"mode\":%d,\"strength\":%.9g,\"curves\":[", first ? "" : ",", name,
         (int)p.channel, (int)p.mode, p.strength);
  for(int ch = 0; ch < DT_IOP_COLORZONES_MAX_CHANNELS; ch++)
  {
    printf("%s{\"interpolation\":%d,\"nodes\":[", ch ? "," : "", p.curve_type[ch]);
    for(int i = 0; i < p.curve_num_nodes[ch]; i++)
      printf("%s[%.9g,%.9g]", i ? "," : "", p.curve[ch][i].x, p.curve[ch][i].y);
    std::vector<float> curve;
    for(const float s : selects) curve.push_back(lookup(d->lut[ch], s));
    printf("],\"lookup\":");
    print_floats(curve.data(), curve.size());
    printf("}");
  }
  printf("],\"out\":");
  print_floats(out.data(), out.size());
  printf("}");
  free(d);
}

int main()
{
  std::vector<float> lab;
  lab_inputs(lab);

  // lookup() positions: below 0 and above 1 included, and the exact ends
  std::vector<float> selects;
  for(int k = -4; k <= 516; k++) selects.push_back(k / 512.f);
  selects.push_back(1e-6f);
  selects.push_back(0.99999f);

  printf("{\"lab\":");
  print_floats(lab.data(), lab.size());
  printf(",\"selects\":");
  print_floats(selects.data(), selects.size());
  printf(",\"cases\":[");
  for(size_t c = 0; c < CASES.size(); c++) print_case(CASES[c].name, params_of(CASES[c]), lab, selects, c == 0);
  printf("],\"presets\":[");
  const std::vector<Named> named = presets();
  for(size_t c = 0; c < named.size(); c++) print_case(named[c].name, named[c].p, lab, selects, c == 0);
  printf("]}\n");
  return 0;
}
