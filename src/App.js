import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import disciplinasPorCurso from "./disciplinas_por_curso.json";
import disciplinasOptativasData from "./disciplinas_optativas.json";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import api from "./api";

import "jspdf-autotable";

const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const horarios = ["07:30-09:30", "09:30-11:30", "13:30-15:30", "15:30-17:30"];

// cores por curso
const cores = {
  "Engenharia de Computação": "#4CAF50",
  "Engenharia de Controle e Automação": "#2196F3",
  "Engenharia Química": "#FF9800",
  "Engenharia de Transportes": "#9C27B0",
  "Engenharia de Minas": "#E91E63",
  "Optativas": "#9E9E9E",
  optativa: "#9E9E9E"
};

// mapa de prefixos de turma por curso (corrige o problema de sempre usar "VE")
const cursoPrefix = {
  "Engenharia de Computação": "VE",
  "Engenharia de Controle e Automação": "VC",
  "Engenharia Química": "VQ",
  "Engenharia de Transportes": "VT",
  "Engenharia de Minas": "VM",
  "Optativas": "VO"
};

// helper: extrai o número da turma independentemente do prefixo (ex: "VE3" => 3, "VC12" => 12)
const getNumeroFromTurma = turmaStr => {
  const m = String(turmaStr || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};

// normalizando optativas
const disciplinasOptativasNormalizadas = disciplinasOptativasData.map(d => ({
  ...d,
  semestre: 0,
  carga_horaria: d.carga_horaria.trim(),
  curso: "Optativas"
}));

export default function App() {
  const [cursoSelecionado, setCursoSelecionado] = useState("Engenharia de Computação");
  const [periodo, setPeriodo] = useState("20252");
  const [turmasCriadas, setTurmasCriadas] = useState({});
  const [contadorTurmas, setContadorTurmas] = useState({});
  const [slots, setSlots] = useState({});

  // carregar dados do servidor e recalcular contadorTurmas
  useEffect(() => {
    api.get(`/horarios/${periodo}`)
        .then(res => {
          const data = res.data;

          if (data) {
            setTurmasCriadas(data.turmasCriadas || {});
            setSlots(data.slots || {});

            // recalcular contadorTurmas com base nas turmas existentes
            const contador = {};
            Object.values(data.turmasCriadas || {}).flat().forEach(t => {
              const prefix = cursoPrefix[t.curso] || "VE";
              const numero = getNumeroFromTurma(t.turma);
              if (!contador[prefix] || numero > contador[prefix]) {
                contador[prefix] = numero;
              }
            });
            setContadorTurmas(contador);

          } else {
            setTurmasCriadas({});
            setContadorTurmas({});
            setSlots({});
          }
        })
        .catch(err => {
          console.error("Erro carregando:", err);
          setTurmasCriadas({});
          setContadorTurmas({});
          setSlots({});
        });
  }, [periodo]);

  const disciplinasCurso = cursoSelecionado === "Optativas"
      ? disciplinasOptativasNormalizadas
      : (disciplinasPorCurso[cursoSelecionado] || []).map(d => ({
        ...d,
        semestre: Number(d.semestre),
        carga_horaria: d.carga_horaria.trim(),
        curso: cursoSelecionado
      }));

  const aulasPorSemana = carga => {
    if (carga.includes("32")) return 1;
    if (carga.includes("64")) return 2;
    if (carga.includes("96")) return 3;
    return 1;
  };

  const criarTurmas = disciplina => {
    const qtd = parseInt(prompt(`Quantas turmas deseja criar para ${disciplina.nome}?`));
    if (!qtd || qtd <= 0) return;

    const numerosExistentes = new Set();

    // buscar turmas existentes do mesmo curso
    Object.values(turmasCriadas).flat()
        .filter(t => (cursoPrefix[t.curso] || "VE") === (cursoPrefix[disciplina.curso] || "VE"))
        .forEach(t => numerosExistentes.add(getNumeroFromTurma(t.turma)));

    Object.values(slots).flat()
        .filter(t => (cursoPrefix[t.curso] || "VE") === (cursoPrefix[disciplina.curso] || "VE"))
        .forEach(t => numerosExistentes.add(getNumeroFromTurma(t.turma)));

    const professorNome = prompt(`Digite o nome do professor para ${disciplina.nome}:`);
    const blocos = aulasPorSemana(disciplina.carga_horaria);
    const newTurmas = [];

    let nextNum = 1;
    while (numerosExistentes.has(nextNum)) nextNum++;

    const prefix = cursoPrefix[disciplina.curso] || "VE";

    for (let i = 0; i < qtd; i++) {
      while (numerosExistentes.has(nextNum)) nextNum++;

      for (let b = 1; b <= blocos; b++) {
        newTurmas.push({
          ...disciplina,
          turma: `${prefix}${nextNum}`,
          bloco: b,
          professor: professorNome
        });
      }

      numerosExistentes.add(nextNum);
      nextNum++;
    }

    setTurmasCriadas(prev => ({
      ...prev,
      [disciplina.codigo]: [...(prev[disciplina.codigo] || []), ...newTurmas]
    }));

    // atualiza contadorTurmas por prefixo do curso
    const maxNum = Math.max(...Array.from(numerosExistentes));
    setContadorTurmas(prev => ({
      ...prev,
      [prefix]: Math.max(prev[prefix] || 0, maxNum)
    }));
  };

  // filtrar turmas disponíveis
  const turmasDisponiveis = Object.values(turmasCriadas)
      .flat()
      .filter(t =>
          !Object.values(slots)
              .flat()
              .some(s => s.codigo === t.codigo && s.bloco === t.bloco && s.turma === t.turma)
      );

  const onDragEnd = result => {
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId.startsWith("slot-")) {
      setSlots(prev => {
        const sourceList = Array.from(prev[source.droppableId] || []);
        const [removed] = sourceList.splice(source.index, 1);

        if (destination.droppableId === "lixeira") return { ...prev, [source.droppableId]: sourceList };

        const destList = Array.from(prev[destination.droppableId] || []);
        // garante que não se repita a mesma disciplina + mesma turma + mesmo bloco
        if (!destList.some(t => t.codigo === removed.codigo && t.turma === removed.turma && t.bloco === removed.bloco)) {
          destList.splice(destination.index, 0, removed);
        }

        return { ...prev, [source.droppableId]: sourceList, [destination.droppableId]: destList };
      });
    } else if (source.droppableId === "disponiveis") {
      const item = turmasDisponiveis[source.index];
      setSlots(prev => {
        const destList = Array.from(prev[destination.droppableId] || []);
        // mesma verificação de duplicidade
        if (!destList.some(t => t.codigo === item.codigo && t.turma === item.turma && t.bloco === item.bloco)) {
          destList.splice(destination.index, 0, item);
        }
        return { ...prev, [destination.droppableId]: destList };
      });
    }
  };

  const exportarPDF = () => {
    const tabela = document.getElementById("tabela-horario");
    if (!tabela) return;

    html2canvas(tabela, { scale: 2, backgroundColor: "#FFFFFF" }).then(canvas => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let finalWidth = imgWidth;
      let finalHeight = imgHeight;
      if (imgHeight > pageHeight) {
        finalHeight = pageHeight;
        finalWidth = (canvas.width * pageHeight) / canvas.height;
      }
      const posX = (pageWidth - finalWidth) / 2;
      const posY = (pageHeight - finalHeight) / 2;
      pdf.addImage(imgData, "PNG", posX, posY, finalWidth, finalHeight);
      pdf.save(`Horario_${cursoSelecionado}.pdf`);
    });
  };

  const salvarNoServidor = () => {
    const dados = { periodo, curso: cursoSelecionado, turmasCriadas, contadorTurmas, slots };
    api.post("/horarios", dados)
        .then(resp => {
          alert("✅ Horário salvo no servidor!");
        })
        .catch(err => {
          console.error(err);
          alert("❌ Erro ao salvar no servidor.");
        });
  };

  const exportarRelatorioPDF = () => {
    const headers = ["Curso", "Disciplina", "Turma", "Professor", "Horário", "Carga Horária"];
    let csvContent = headers.join(",") + "\n";

    Object.entries(slots).forEach(([slotId, turmas]) => {
      const horario = slotId.split("-").slice(2).join("-") || "N/A";
      turmas.forEach(t => {
        const row = [
          t.curso ?? "N/A",
          t.nome ?? t.disciplina ?? "N/A",
          t.turma ?? "N/A",
          t.professor ?? "N/A",
          horario,
          t.carga_horaria ?? "N/A"
        ];
        csvContent += row.map(val => `"${val}"`).join(",") + "\n";
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Relatorio_Horario_${cursoSelecionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
      <div style={{ padding: "20px" }}>
        <h2>📅 Horário Semestral</h2>
        <div>
          <label>
            Curso:
            <select value={cursoSelecionado} onChange={e => setCursoSelecionado(e.target.value)}>
              {Object.keys(disciplinasPorCurso).map(curso => (
                  <option key={curso} value={curso}>{curso}</option>
              ))}
              <option value="Optativas">Optativas</option>
            </select>
          </label>
          <label style={{ marginLeft: "10px" }}>
            Período:
            <input type="text" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ width: "80px", marginLeft: "5px" }} />
          </label>
          <button onClick={exportarPDF}>📄 Exportar PDF</button>
          <button onClick={exportarRelatorioPDF}>📄 Relatório Detalhado</button>
          <button onClick={salvarNoServidor}>💾 Salvar no servidor</button>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: "flex", gap: "20px", marginTop: "15px" }}>
            {/* painel lateral disciplinas */}
            <div style={{ width: "300px", maxHeight: "600px", overflowY: "auto", padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
              <h3>Disciplinas de {cursoSelecionado}</h3>
              {disciplinasCurso.map(d => (
                  <div key={d.codigo} style={{ padding: "8px", margin: "5px 0", backgroundColor: cores[d.curso] || cores.optativa, color: "white", borderRadius: "6px", fontWeight: "bold" }}>
                    {`${d.nome} (${d.semestre === 0 ? "Optativa" : d.semestre}) [${d.codigo}]`}
                    <br/>
                    <small>{d.carga_horaria}</small>
                    <br/>
                    <button onClick={() => criarTurmas(d)}>Criar turmas</button>
                  </div>
              ))}

              <h4>⬇️ Turmas disponíveis</h4>
              <Droppable droppableId="disponiveis">
                {provided => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {turmasDisponiveis.map((t, index) => (
                          <Draggable key={`${t.codigo}-${t.turma}-${t.bloco}`} draggableId={`${t.codigo}-${t.turma}-${t.bloco}`} index={index}>
                            {provided => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} style={{ padding: "6px", margin: "4px 0", backgroundColor: cores[t.curso] || cores.optativa, color: "white", borderRadius: "4px", fontSize: "0.85em", ...provided.draggableProps.style }}>
                                  {`${t.nome} [${t.turma}] - Prof. ${t.professor}`}
                                </div>
                            )}
                          </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                )}
              </Droppable>
            </div>

            {/* tabela horários */}
            <table id="tabela-horario" border="1" cellPadding="10" style={{ borderCollapse: "collapse" }}>
              <thead>
              <tr>
                <th>Horário</th>
                {dias.map(d => <th key={d}>{d}</th>)}
              </tr>
              </thead>
              <tbody>
              {horarios.map(h => (
                  <tr key={h}>
                    <td>{h}</td>
                    {dias.map(d => {
                      const slotId = `slot-${d}-${h}`;
                      return (
                          <td key={slotId} style={{ minWidth: "180px", height: "80px" }}>
                            <Droppable droppableId={slotId}>
                              {provided => (
                                  <div ref={provided.innerRef} {...provided.droppableProps} style={{ minHeight: "60px" }}>
                                    {(slots[slotId] || []).map((t, index) => (
                                        <Draggable key={`${t.codigo}-${t.turma}-${t.bloco}`} draggableId={`${t.codigo}-${t.turma}-${t.bloco}`} index={index}>
                                          {provided => (
                                              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} style={{ padding: "6px", margin: "4px 0", backgroundColor: cores[t.curso] || cores.optativa, color: "white", borderRadius: "4px", fontSize: "0.85em", ...provided.draggableProps.style }}>
                                                <div>{`${t.nome} (${t.semestre === 0 ? "Optativa" : t.semestre}) [${t.turma}]`}<br/>
                                                  <small>{t.carga_horaria}</small><br/>
                                                  <strong>{t.professor}</strong></div>
                                              </div>
                                          )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                  </div>
                              )}
                            </Droppable>
                          </td>
                      );
                    })}
                  </tr>
              ))}
              </tbody>
            </table>

            {/* lixeira */}
            <Droppable droppableId="lixeira">
              {provided => (
                  <div ref={provided.innerRef} {...provided.droppableProps} style={{ marginTop: "20px", padding: "10px", border: "2px dashed red", borderRadius: "6px", textAlign: "center", color: "red" }}>
                    Arraste aqui para remover
                    {provided.placeholder}
                  </div>
              )}
            </Droppable>
          </div>
        </DragDropContext>
      </div>
  );
}
