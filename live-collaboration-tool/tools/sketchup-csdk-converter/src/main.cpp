#include <SketchUpAPI/initialize.h>
#include <SketchUpAPI/common.h>
#include <SketchUpAPI/geometry.h>
#include <SketchUpAPI/geometry/point3d.h>
#include <SketchUpAPI/geometry/transformation.h>
#include <SketchUpAPI/geometry/vector3d.h>
#include <SketchUpAPI/model/component_definition.h>
#include <SketchUpAPI/model/component_instance.h>
#include <SketchUpAPI/model/entities.h>
#include <SketchUpAPI/model/face.h>
#include <SketchUpAPI/model/group.h>
#include <SketchUpAPI/model/material.h>
#include <SketchUpAPI/model/mesh_helper.h>
#include <SketchUpAPI/model/model.h>
#include <SketchUpAPI/model/texture_writer.h>
#include <SketchUpAPI/unicodestring.h>

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace fs = std::filesystem;

static SUTransformation IdentityTransform() {
  SUTransformation t{};
  for (int i = 0; i < 16; i++) t.values[i] = 0.0;
  t.values[0] = 1.0;
  t.values[5] = 1.0;
  t.values[10] = 1.0;
  t.values[15] = 1.0;
  return t;
}

static void Normalize(SUVector3D* v) {
  const double len = std::sqrt(v->x * v->x + v->y * v->y + v->z * v->z);
  if (len > 0.0) {
    v->x /= len;
    v->y /= len;
    v->z /= len;
  }
}

struct ObjWriter {
  std::ofstream obj;
  std::ofstream mtl;
  fs::path base_dir;
  size_t next_index = 1;  // OBJ is 1-based
  std::string current_usemtl;
  std::unordered_set<std::string> written_mtls;
  std::unordered_set<long> written_textures;

  explicit ObjWriter(const fs::path& out_dir) {
    base_dir = out_dir;
    const fs::path obj_path = out_dir / "model.obj";
    const fs::path mtl_path = out_dir / "model.mtl";
    obj.open(obj_path, std::ios::out | std::ios::trunc);
    mtl.open(mtl_path, std::ios::out | std::ios::trunc);
    obj << "mtllib model.mtl\n";
  }

  bool ok() const { return obj.good() && mtl.good(); }

  static std::string sanitize_name(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.') {
        out.push_back(c);
      } else {
        out.push_back('_');
      }
    }
    if (out.empty()) out = "mat";
    return out;
  }

  void usemtl(const std::string& name) {
    if (name.empty()) return;
    if (name == current_usemtl) return;
    obj << "usemtl " << name << "\n";
    current_usemtl = name;
  }

  void ensure_color_material(const std::string& raw_name, double r, double g, double b) {
    const std::string name = sanitize_name(raw_name);
    if (written_mtls.count(name)) return;
    written_mtls.insert(name);
    mtl << "newmtl " << name << "\n";
    mtl << "Kd " << r << " " << g << " " << b << "\n";
    mtl << "Ka 0 0 0\n";
    mtl << "Ks 0 0 0\n";
    mtl << "d 1\n";
    mtl << "illum 1\n\n";
  }

  void ensure_texture_material(
      SUTextureWriterRef texture_writer,
      long texture_id,
      const std::string& material_name,
      const std::string& texture_rel_path) {
    if (!written_mtls.count(material_name)) {
      written_mtls.insert(material_name);
      mtl << "newmtl " << material_name << "\n";
      mtl << "Kd 1 1 1\n";
      mtl << "Ka 0 0 0\n";
      mtl << "Ks 0 0 0\n";
      mtl << "d 1\n";
      mtl << "illum 2\n";
      mtl << "map_Kd " << texture_rel_path << "\n\n";
    }

    if (written_textures.count(texture_id)) return;
    written_textures.insert(texture_id);

    const fs::path tex_abs = base_dir / texture_rel_path;
    fs::create_directories(tex_abs.parent_path());
    // png로 강제 출력
    SUTextureWriterWriteTexture(texture_writer, texture_id, tex_abs.string().c_str(), false);
  }

  // v/vt/vn를 모두 동일 인덱스로 추가(삼각형마다 유니크 정점으로 단순화)
  size_t add_vertex(const SUPoint3D& p, const SUVector3D& n, double u, double v) {
    obj << "v " << p.x << " " << p.y << " " << p.z << "\n";
    obj << "vt " << u << " " << v << "\n";
    obj << "vn " << n.x << " " << n.y << " " << n.z << "\n";
    return next_index++;
  }

  void add_triangle(size_t a, size_t b, size_t c) {
    obj << "f " << a << "/" << a << "/" << a
        << " " << b << "/" << b << "/" << b
        << " " << c << "/" << c << "/" << c << "\n";
  }
};

static SUResult ExportEntitiesOBJ(
    SUEntitiesRef entities,
    const SUTransformation* parent_xf,
    SUTextureWriterRef texture_writer,
    ObjWriter& out);

// SUString -> std::string (UTF-8)
static std::string SUStringToUTF8(SUStringRef s) {
  size_t length = 0;
  SUStringGetUTF8Length(s, &length);
  std::string out;
  out.resize(length + 1);
  size_t returned = 0;
  SUStringGetUTF8(s, length + 1, out.data(), &returned);
  out.resize(returned);
  return out;
}

static SUResult ExportFaceOBJ(
    SUFaceRef face,
    const SUTransformation* xf,
    SUTextureWriterRef texture_writer,
    ObjWriter& out) {
  // material/texture 결정 (front 기준)
  std::string mtl_name = "default";
  out.ensure_color_material("default", 0.8, 0.8, 0.8);

  SUMaterialRef front_mat = SU_INVALID;
  if (SUFaceGetFrontMaterial(face, &front_mat) == SU_ERROR_NONE && !SUIsInvalid(front_mat)) {
    SUStringRef su_name = SU_INVALID;
    SUStringCreate(&su_name);
    if (SUMaterialGetNameLegacyBehavior(front_mat, &su_name) == SU_ERROR_NONE) {
      const std::string raw = SUStringToUTF8(su_name);
      if (!raw.empty()) mtl_name = ObjWriter::sanitize_name(raw);
    }
    SUStringRelease(&su_name);

    SUColor c{};
    if (SUMaterialGetColor(front_mat, &c) == SU_ERROR_NONE) {
      out.ensure_color_material(mtl_name, c.red / 255.0, c.green / 255.0, c.blue / 255.0);
    }
  }

  // back material fallback (front가 없거나 이름이 default일 때)
  if (mtl_name == "default") {
    SUMaterialRef back_mat = SU_INVALID;
    if (SUFaceGetBackMaterial(face, &back_mat) == SU_ERROR_NONE && !SUIsInvalid(back_mat)) {
      SUStringRef su_name = SU_INVALID;
      SUStringCreate(&su_name);
      if (SUMaterialGetNameLegacyBehavior(back_mat, &su_name) == SU_ERROR_NONE) {
        const std::string raw = SUStringToUTF8(su_name);
        if (!raw.empty()) mtl_name = ObjWriter::sanitize_name(raw);
      }
      SUStringRelease(&su_name);

      SUColor c{};
      if (SUMaterialGetColor(back_mat, &c) == SU_ERROR_NONE) {
        out.ensure_color_material(mtl_name, c.red / 255.0, c.green / 255.0, c.blue / 255.0);
      }
    }
  }

  // 텍스처가 있는 face면 texture_writer로 추출 + 전용 mtl로 교체
  long front_tex_id = 0;
  long back_tex_id = 0;
  bool use_back_texture = false;
  if (SUTextureWriterLoadFace(texture_writer, face, &front_tex_id, &back_tex_id) == SU_ERROR_NONE &&
      (front_tex_id != 0 || back_tex_id != 0)) {
    const long chosen_tex_id = front_tex_id != 0 ? front_tex_id : back_tex_id;
    use_back_texture = (front_tex_id == 0 && back_tex_id != 0);
    const std::string tex_mtl = std::string("tex_") + std::to_string(chosen_tex_id);
    const std::string tex_rel = std::string("model/") + tex_mtl + ".png";
    out.ensure_texture_material(texture_writer, chosen_tex_id, tex_mtl, tex_rel);
    mtl_name = tex_mtl;
  }

  out.usemtl(mtl_name);

  SUMeshHelperRef mesh = SU_INVALID;
  SUResult res = SUMeshHelperCreateWithTextureWriter(&mesh, face, texture_writer);
  if (res != SU_ERROR_NONE) return res;

  size_t num_vertices = 0;
  SUMeshHelperGetNumVertices(mesh, &num_vertices);
  if (num_vertices == 0) {
    SUMeshHelperRelease(&mesh);
    return SU_ERROR_NONE;
  }

  std::vector<SUPoint3D> vertices(num_vertices);
  size_t got_vertices = 0;
  SUMeshHelperGetVertices(mesh, num_vertices, vertices.data(), &got_vertices);

  std::vector<SUVector3D> normals(num_vertices);
  size_t got_normals = 0;
  if (SUMeshHelperGetNormals(mesh, num_vertices, normals.data(), &got_normals) != SU_ERROR_NONE) {
    // normals를 못 얻으면 기본값(0,0,1)
    for (size_t i = 0; i < num_vertices; i++) normals[i] = SUVector3D{0, 0, 1};
    got_normals = num_vertices;
  }

  std::vector<SUPoint3D> front_stq(num_vertices);
  std::vector<SUPoint3D> back_stq(num_vertices);
  size_t got_stq = 0;
  const bool has_stq =
      (SUMeshHelperGetFrontSTQCoords(mesh, num_vertices, front_stq.data(), &got_stq) == SU_ERROR_NONE) &&
      (got_stq == num_vertices);
  size_t got_back_stq = 0;
  const bool has_back_stq =
      (SUMeshHelperGetBackSTQCoords(mesh, num_vertices, back_stq.data(), &got_back_stq) == SU_ERROR_NONE) &&
      (got_back_stq == num_vertices);

  size_t num_triangles = 0;
  SUMeshHelperGetNumTriangles(mesh, &num_triangles);
  if (num_triangles == 0) {
    SUMeshHelperRelease(&mesh);
    return SU_ERROR_NONE;
  }

  const size_t num_indices = num_triangles * 3;
  std::vector<size_t> indices(num_indices);
  size_t got_indices = 0;
  SUMeshHelperGetVertexIndices(mesh, num_indices, indices.data(), &got_indices);
  if (got_indices != num_indices) {
    SUMeshHelperRelease(&mesh);
    return SU_ERROR_GENERIC;
  }

  // 삼각형 출력: 각 tri vertex를 유니크 정점으로 써서 OBJ 단순화
  for (size_t t = 0; t < num_triangles; t++) {
    size_t tri_idx[3];
    for (int k = 0; k < 3; k++) {
      const size_t vi = indices[t * 3 + k];
      SUPoint3D p = vertices[vi];
      SUPoint3DTransform(xf, &p);

      SUVector3D n = normals[vi];
      SUVector3DTransform(xf, &n);
      Normalize(&n);

      double u = 0.0;
      double v = 0.0;
      const bool can_use_stq = (!use_back_texture && has_stq) || (use_back_texture && has_back_stq);
      if (can_use_stq) {
        const SUPoint3D stq = use_back_texture ? back_stq[vi] : front_stq[vi];
        const double q = (stq.z == 0.0 ? 1.0 : stq.z);
        u = stq.x / q;
        v = stq.y / q;
      }

      tri_idx[k] = out.add_vertex(p, n, u, v);
    }
    out.add_triangle(tri_idx[0], tri_idx[1], tri_idx[2]);
  }

  SUMeshHelperRelease(&mesh);
  return SU_ERROR_NONE;
}

static void usage() {
  std::cerr
      << "sketchup-csdk-converter --input <file.skp> --outputDir <dir> --format <obj|dae>\n"
      << "\n"
      << "Output contract:\n"
      << "  format=obj => <outputDir>/model.obj, <outputDir>/model.mtl, (optional) <outputDir>/model/* textures\n"
      << "  format=dae => <outputDir>/model.dae, (optional) <outputDir>/model/* textures\n";
}

int main(int argc, char** argv) {
  std::string input;
  std::string outputDir;
  std::string format = "obj";

  // 지원 1) positional: <input> <outputDir> [format]
  // - 서버 기본 args 규약(["{input}","{output}","{format}"])과 호환
  if (argc >= 3 && argv[1][0] != '-' && argv[2][0] != '-') {
    input = argv[1];
    outputDir = argv[2];
    if (argc >= 4 && argv[3][0] != '-') format = argv[3];
  } else {
    // 지원 2) flags: --input/--outputDir/--format
    for (int i = 1; i < argc; i++) {
      std::string a = argv[i];
      if ((a == "--input" || a == "-i") && i + 1 < argc) {
        input = argv[++i];
      } else if ((a == "--outputDir" || a == "-o") && i + 1 < argc) {
        outputDir = argv[++i];
      } else if ((a == "--format" || a == "-f") && i + 1 < argc) {
        format = argv[++i];
      } else if (a == "--help" || a == "-h") {
        usage();
        return 0;
      } else {
        std::cerr << "Unknown argument: " << a << "\n";
        usage();
        return 2;
      }
    }
  }

  if (input.empty() || outputDir.empty()) {
    usage();
    return 2;
  }
  if (!(format == "obj" || format == "dae")) {
    std::cerr << "Invalid --format: " << format << " (expected obj|dae)\n";
    return 2;
  }

  if (format == "dae") {
    std::cerr << "DAE export is not implemented yet. Use --format obj for now.\n";
    return 2;
  }

  fs::path out_dir(outputDir);
  fs::create_directories(out_dir);
  // 텍스처 폴더 규약(선택): outputDir/model/*
  fs::create_directories(out_dir / "model");

  ObjWriter writer(out_dir);
  if (!writer.ok()) {
    std::cerr << "Failed to open output files in: " << outputDir << "\n";
    return 1;
  }

  // SDK init (headless)
  SUInitialize();

  SUModelRef model = SU_INVALID;
  SUModelLoadStatus status;
  SUResult res = SUModelCreateFromFileWithStatus(&model, input.c_str(), &status);
  if (res != SU_ERROR_NONE) {
    std::cerr << "Failed to load SKP: " << input << " (SUResult=" << static_cast<int>(res) << ")\n";
    SUTerminate();
    return 1;
  }
  if (status == SUModelLoadStatus_Success_MoreRecent) {
    std::cerr << "Warning: model created in newer SketchUp version; some data may not be read.\n";
  }

  SUTextureWriterRef texture_writer = SU_INVALID;
  SUTextureWriterCreate(&texture_writer);

  SUEntitiesRef entities = SU_INVALID;
  SUModelGetEntities(model, &entities);
  const SUTransformation identity = IdentityTransform();

  res = ExportEntitiesOBJ(entities, &identity, texture_writer, writer);

  SUTextureWriterRelease(&texture_writer);
  SUModelRelease(&model);
  SUTerminate();

  if (res != SU_ERROR_NONE) {
    std::cerr << "Export failed (SUResult=" << static_cast<int>(res) << ")\n";
    return 1;
  }

  std::cerr << "Export OK: " << (out_dir / "model.obj") << "\n";
  return 0;
}

static SUResult ExportEntitiesOBJ(
    SUEntitiesRef entities,
    const SUTransformation* parent_xf,
    SUTextureWriterRef texture_writer,
    ObjWriter& out) {
  // Faces
  size_t face_count = 0;
  SUEntitiesGetNumFaces(entities, &face_count);
  if (face_count > 0) {
    std::vector<SUFaceRef> faces(face_count);
    size_t got = 0;
    SUEntitiesGetFaces(entities, face_count, faces.data(), &got);
    for (size_t i = 0; i < got; i++) {
      const SUResult r = ExportFaceOBJ(faces[i], parent_xf, texture_writer, out);
      if (r != SU_ERROR_NONE) return r;
    }
  }

  // Groups
  size_t group_count = 0;
  SUEntitiesGetNumGroups(entities, &group_count);
  if (group_count > 0) {
    std::vector<SUGroupRef> groups(group_count);
    size_t got = 0;
    SUEntitiesGetGroups(entities, group_count, groups.data(), &got);
    for (size_t i = 0; i < got; i++) {
      SUTransformation gx = IdentityTransform();
      SUGroupGetTransform(groups[i], &gx);
      SUTransformation combined = IdentityTransform();
      SUTransformationMultiply(parent_xf, &gx, &combined);

      SUEntitiesRef child = SU_INVALID;
      SUGroupGetEntities(groups[i], &child);
      const SUResult r = ExportEntitiesOBJ(child, &combined, texture_writer, out);
      if (r != SU_ERROR_NONE) return r;
    }
  }

  // Component instances
  size_t inst_count = 0;
  SUEntitiesGetNumInstances(entities, &inst_count);
  if (inst_count > 0) {
    std::vector<SUComponentInstanceRef> insts(inst_count);
    size_t got = 0;
    SUEntitiesGetInstances(entities, inst_count, insts.data(), &got);
    for (size_t i = 0; i < got; i++) {
      SUTransformation ix = IdentityTransform();
      SUComponentInstanceGetTransform(insts[i], &ix);
      SUTransformation combined = IdentityTransform();
      SUTransformationMultiply(parent_xf, &ix, &combined);

      SUComponentDefinitionRef def = SU_INVALID;
      SUComponentInstanceGetDefinition(insts[i], &def);
      SUEntitiesRef child = SU_INVALID;
      SUComponentDefinitionGetEntities(def, &child);

      const SUResult r = ExportEntitiesOBJ(child, &combined, texture_writer, out);
      if (r != SU_ERROR_NONE) return r;
    }
  }

  return SU_ERROR_NONE;
}

